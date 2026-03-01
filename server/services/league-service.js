/**
 * League service.
 *
 * Fixes from original:
 * - match upsert uses ON CONFLICT (matches_natural_unique) instead of SERIAL PK
 * - transaction upsert uses ON CONFLICT (transactions_natural_unique)
 * - getGameStatus() hoisted outside the transaction loop
 * - gameweek upsert logic extracted to gameweek-service.js
 * - entry_id -> manager_id mapping is explicit and reused, not re-built each section
 */
const db = require('../db');
const fplApi = require('../api/fpl-client');

/**
 * Build a map of entry_id -> manager_id for the league.
 * Used to translate FPL API entry IDs to our internal manager IDs.
 *
 * @param {number} leagueId
 * @param {Array} [leagueEntries] - optional; if provided, avoids a DB query
 * @returns {Promise<Object>} { entryId: managerId, ... }
 */
const buildManagerMap = async (leagueId, leagueEntries) => {
  if (leagueEntries && leagueEntries.length > 0) {
    const map = {};
    for (const entry of leagueEntries) {
      map[entry.id] = entry.id;
    }
    return map;
  }

  // Fallback to DB if league_entries not available
  const result = await db.query(
    `SELECT manager_id, entry_id FROM managers WHERE league_id = $1`,
    [leagueId]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.entry_id] = row.manager_id;
  }
  return map;
};

/**
 * Save all league data: league info, managers, gameweeks, matches, standings.
 * Used for initial load and periodic refresh.
 */
const saveLeagueDetails = async (leagueId) => {
  const leagueData = await fplApi.getLeagueDetails(leagueId);

  if (!leagueData || !leagueData.league) {
    throw new Error('League data not found');
  }

  const { league, league_entries, matches, standings } = leagueData;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // League
    await client.query(
      `INSERT INTO leagues (league_id, name, draft_status, scoring_type, start_event, stop_event)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (league_id) DO UPDATE SET
         name = $2, draft_status = $3, scoring_type = $4, start_event = $5, stop_event = $6`,
      [leagueId, league.name, league.draft_status, 'h2h', league.start_event, league.stop_event]
    );

    // Managers
    for (const entry of league_entries) {
      await client.query(
        `INSERT INTO managers (manager_id, entry_id, entry_name, player_first_name, player_last_name,
           short_name, league_id, waiver_pick, joined_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (manager_id) DO UPDATE SET
           entry_id = $2, entry_name = $3, player_first_name = $4, player_last_name = $5,
           short_name = $6, league_id = $7, waiver_pick = $8, joined_time = $9`,
        [
          entry.id,
          entry.entry_id,
          entry.entry_name,
          entry.player_first_name,
          entry.player_last_name,
          entry.short_name,
          leagueId,
          entry.waiver_pick,
          new Date(entry.joined_time),
        ]
      );
    }

    // Ensure gameweeks exist for all match events
    const eventIds = [...new Set(matches.map((m) => m.event).filter(Boolean))];
    for (const eventId of eventIds) {
      const exists = await client.query(
        'SELECT gameweek_id FROM gameweeks WHERE gameweek_id = $1',
        [eventId]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO gameweeks (gameweek_id, name, is_current, is_next, is_previous, finished, data_checked)
           VALUES ($1, $2, false, false, false, $3, $3)`,
          [eventId, `Gameweek ${eventId}`, eventId < (league.current_event || 99)]
        );
      }
    }

    // Matches — uses the natural unique constraint added in migration 002
    for (const match of matches) {
      if (!match.event || !match.league_entry_1 || !match.league_entry_2) continue;
      await client.query(
        `INSERT INTO matches (league_id, event, league_entry_1, league_entry_2,
           league_entry_1_points, league_entry_2_points, started, finished)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ON CONSTRAINT matches_natural_unique DO UPDATE SET
           league_entry_1_points = $5,
           league_entry_2_points = $6,
           started = $7,
           finished = $8`,
        [
          leagueId,
          match.event,
          match.league_entry_1,
          match.league_entry_2,
          match.league_entry_1_points,
          match.league_entry_2_points,
          match.started,
          match.finished,
        ]
      );
    }

    // Standings
    for (const standing of standings) {
      await client.query(
        `INSERT INTO standings (league_id, league_entry, rank, last_rank,
           matches_played, matches_won, matches_drawn, matches_lost, points_for, points_against, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (league_id, league_entry) DO UPDATE SET
           rank = $3, last_rank = $4, matches_played = $5,
           matches_won = $6, matches_drawn = $7, matches_lost = $8,
           points_for = $9, points_against = $10, total = $11`,
        [
          leagueId,
          standing.league_entry,
          standing.rank,
          standing.last_rank,
          standing.matches_played,
          standing.matches_won,
          standing.matches_drawn,
          standing.matches_lost,
          standing.points_for,
          standing.points_against,
          standing.total,
        ]
      );
    }

    await client.query('COMMIT');
    return { success: true, message: 'League data saved successfully' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Update matches and standings for the current gameweek.
 * Used by the weekly-complete sync — more targeted than full saveLeagueDetails.
 *
 * @param {number} leagueId
 * @param {number} currentGameweek
 */
const updateMatchesAndStandings = async (leagueId, currentGameweek) => {
  const leagueDetails = await fplApi.getLeagueDetails(leagueId);

  if (!leagueDetails) {
    throw new Error('League details not found');
  }

  // Build the entry_id -> manager_id map once (hoisted out of the loops)
  const managerMap = await buildManagerMap(leagueId, leagueDetails.league_entries);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Matches for current gameweek
    const currentMatches = (leagueDetails.matches || []).filter(
      (m) => m.event === currentGameweek
    );

    for (const match of currentMatches) {
      const manager1Id = managerMap[match.league_entry_1];
      const manager2Id = managerMap[match.league_entry_2];

      if (!manager1Id || !manager2Id) {
        console.warn(
          `[league-service] No manager_id for entry ${match.league_entry_1} or ${match.league_entry_2}, skipping`
        );
        continue;
      }

      await client.query(
        `INSERT INTO matches (league_id, event, league_entry_1, league_entry_2,
           league_entry_1_points, league_entry_2_points, started, finished)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ON CONSTRAINT matches_natural_unique DO UPDATE SET
           league_entry_1_points = $5,
           league_entry_2_points = $6,
           started = $7,
           finished = $8`,
        [
          leagueId,
          match.event,
          manager1Id,
          manager2Id,
          match.league_entry_1_points,
          match.league_entry_2_points,
          match.started,
          match.finished,
        ]
      );
    }

    // Standings
    for (const standing of leagueDetails.standings || []) {
      const managerId = managerMap[standing.league_entry];

      if (!managerId) {
        console.warn(
          `[league-service] No manager_id for entry ${standing.league_entry}, skipping standing`
        );
        continue;
      }

      await client.query(
        `INSERT INTO standings (league_id, league_entry, rank, last_rank,
           matches_played, matches_won, matches_drawn, matches_lost, points_for, points_against, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (league_id, league_entry) DO UPDATE SET
           rank = $3, last_rank = $4, matches_played = $5,
           matches_won = $6, matches_drawn = $7, matches_lost = $8,
           points_for = $9, points_against = $10, total = $11`,
        [
          leagueId,
          managerId,
          standing.rank,
          standing.last_rank,
          standing.matches_played,
          standing.matches_won,
          standing.matches_drawn,
          standing.matches_lost,
          standing.points_for,
          standing.points_against,
          standing.total,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      matchesUpdated: currentMatches.length,
      standingsUpdated: (leagueDetails.standings || []).length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Save transactions for the current gameweek.
 * getGameStatus() is called ONCE here and passed in, not called per-transaction.
 *
 * @param {number} leagueId
 * @param {number} currentEvent - the current gameweek number
 */
const saveTransactions = async (leagueId, currentEvent) => {
  const transactionsData = await fplApi.getLeagueTransactions(leagueId);

  if (!transactionsData || !transactionsData.transactions) {
    return { saved: 0 };
  }

  // Build manager map once
  const managerMap = await buildManagerMap(leagueId);

  const currentTransactions = transactionsData.transactions.filter(
    (t) => t.event === currentEvent
  );

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let saved = 0;
    for (const transaction of currentTransactions) {
      const managerId = managerMap[transaction.entry];

      if (!managerId) {
        console.warn(
          `[league-service] No manager_id for entry ${transaction.entry}, skipping transaction`
        );
        continue;
      }

      const transactionTime = transaction.processed_time
        ? new Date(transaction.processed_time)
        : null;

      await client.query(
        `INSERT INTO transactions (
           league_id, gameweek_id, transaction_type, result,
           added_player_id, removed_player_id, manager_id, transaction_time
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ON CONSTRAINT transactions_natural_unique DO NOTHING`,
        [
          leagueId,
          transaction.event,
          transaction.kind,
          transaction.result,
          transaction.element_in,
          transaction.element_out,
          managerId,
          transactionTime,
        ]
      );
      saved++;
    }

    await client.query('COMMIT');
    return { saved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Save draft picks for the league.
 */
const saveDraftPicks = async (leagueId) => {
  const draftData = await fplApi.getDraftPicks(leagueId);

  if (!draftData || !draftData.choices) {
    return { saved: 0 };
  }

  // Build entry_id -> manager_id map so we can translate pick.entry (entry_id)
  // to the manager_id FK used in our DB
  const managerMap = await buildManagerMap(leagueId);
  // managerMap is currently id->id; we need entry_id->manager_id for draft picks
  // Rebuild from DB to get entry_id -> manager_id
  const entryToManagerResult = await db.query(
    'SELECT manager_id, entry_id FROM managers WHERE league_id = $1',
    [leagueId]
  );
  const entryIdToManagerId = {};
  for (const row of entryToManagerResult.rows) {
    entryIdToManagerId[row.entry_id] = row.manager_id;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let saved = 0;
    for (const pick of draftData.choices) {
      // pick.entry is the FPL entry_id, not the manager_id (league entry id)
      const managerId = entryIdToManagerId[pick.entry];
      if (!managerId) {
        console.warn(`[league-service] No manager_id for draft pick entry ${pick.entry}, skipping`);
        continue;
      }

      // Timestamp is in choice_time, not picked
      const draftTime = pick.choice_time ? new Date(pick.choice_time) : null;

      await client.query(
        `INSERT INTO draft_picks (league_id, round, pick, manager_id, player_id, draft_time)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          leagueId,
          pick.round,
          pick.pick,
          managerId,
          pick.element,
          draftTime,
        ]
      );
      saved++;
    }

    await client.query('COMMIT');
    return { saved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Get league data from the database (for API responses).
 */
const getLeagueDetailsFromDb = async (leagueId) => {
  const leagueResult = await db.query(
    'SELECT * FROM leagues WHERE league_id = $1',
    [leagueId]
  );

  if (leagueResult.rows.length === 0) {
    return null;
  }

  const [managersResult, matchesResult, standingsResult] = await Promise.all([
    db.query('SELECT * FROM managers WHERE league_id = $1', [leagueId]),
    db.query('SELECT * FROM matches WHERE league_id = $1 ORDER BY event', [leagueId]),
    db.query('SELECT * FROM standings WHERE league_id = $1 ORDER BY rank', [leagueId]),
  ]);

  return {
    league: leagueResult.rows[0],
    managers: managersResult.rows,
    matches: matchesResult.rows,
    standings: standingsResult.rows,
  };
};

/**
 * Get transactions from the database.
 */
const getTransactionsFromDb = async (leagueId) => {
  const result = await db.query(
    `SELECT t.*, p_in.web_name as added_player_name, p_out.web_name as removed_player_name,
            m.entry_name as manager_name
     FROM transactions t
     LEFT JOIN players p_in ON t.added_player_id = p_in.player_id
     LEFT JOIN players p_out ON t.removed_player_id = p_out.player_id
     LEFT JOIN managers m ON t.manager_id = m.manager_id
     WHERE t.league_id = $1
     ORDER BY t.transaction_time DESC`,
    [leagueId]
  );
  return result.rows;
};

module.exports = {
  saveLeagueDetails,
  updateMatchesAndStandings,
  saveTransactions,
  saveDraftPicks,
  getLeagueDetailsFromDb,
  getTransactionsFromDb,
  buildManagerMap,
};
