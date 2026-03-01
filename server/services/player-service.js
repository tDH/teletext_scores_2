/**
 * Player service.
 *
 * Fixes from original:
 * - getGameStatus() is called once and passed to syncGameweeksFromGameStatus,
 *   not called inside loops
 * - gameweek upsert logic uses gameweek-service.js instead of inline copy-paste
 * - uses db.pool.connect() for transactions (client-based) to avoid pool.end() issues
 */
const db = require('../db');
const fplApi = require('../api/fpl-client');
const gameweekService = require('./gameweek-service');

/**
 * Save all players and teams from bootstrap-static.
 * Also syncs current/next/previous gameweeks.
 */
const saveAllPlayers = async () => {
  const bootstrapData = await fplApi.getBootstrapStatic();

  if (!bootstrapData || !bootstrapData.elements || !bootstrapData.teams) {
    throw new Error('Player data not found');
  }

  // Fetch game status once, outside the transaction
  const gameStatus = await fplApi.getGameStatus();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Teams first (players reference teams)
    for (const team of bootstrapData.teams) {
      await client.query(
        `INSERT INTO teams (fpl_team_id, name, short_name, code)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (fpl_team_id) DO UPDATE SET
           name = $2, short_name = $3, code = $4`,
        [team.id, team.name, team.short_name, team.code]
      );
    }

    // Players
    for (const player of bootstrapData.elements) {
      await client.query(
        `INSERT INTO players (player_id, first_name, second_name, web_name, team_id,
           element_type, now_cost, status, total_points, form)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (player_id) DO UPDATE SET
           first_name = $2, second_name = $3, web_name = $4, team_id = $5,
           element_type = $6, now_cost = $7, status = $8, total_points = $9, form = $10`,
        [
          player.id,
          player.first_name,
          player.second_name,
          player.web_name,
          player.team,
          player.element_type,
          player.now_cost,
          player.status,
          player.total_points,
          parseFloat(player.form || 0),
        ]
      );
    }

    // Sync gameweeks using the shared service (uses gameStatus fetched once above)
    if (gameStatus && gameStatus.current_event) {
      await gameweekService.syncGameweeksFromGameStatus(gameStatus, client);
    }

    await client.query('COMMIT');
    return { success: true, message: `Saved ${bootstrapData.elements.length} players` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Save player stats for a completed gameweek.
 *
 * @param {number} gameweek
 */
const savePlayerGameweekStats = async (gameweek) => {
  const liveData = await fplApi.getLiveGameweekData(gameweek);

  if (!liveData || !liveData.elements) {
    throw new Error('Gameweek data not found');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let saved = 0;
    for (const [playerId, data] of Object.entries(liveData.elements)) {
      if (!data.stats) continue;

      const s = data.stats;
      await client.query(
        `INSERT INTO player_gameweek_stats (
           player_id, gameweek_id, total_points, minutes,
           goals_scored, assists, clean_sheets, goals_conceded,
           own_goals, penalties_saved, penalties_missed,
           yellow_cards, red_cards, saves, bonus, bps,
           influence, creativity, threat, ict_index
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (player_id, gameweek_id) DO UPDATE SET
           total_points = $3, minutes = $4, goals_scored = $5,
           assists = $6, clean_sheets = $7, goals_conceded = $8,
           own_goals = $9, penalties_saved = $10, penalties_missed = $11,
           yellow_cards = $12, red_cards = $13, saves = $14,
           bonus = $15, bps = $16, influence = $17,
           creativity = $18, threat = $19, ict_index = $20`,
        [
          parseInt(playerId),
          gameweek,
          s.total_points ?? 0,
          s.minutes ?? 0,
          s.goals_scored ?? 0,
          s.assists ?? 0,
          s.clean_sheets ?? 0,
          s.goals_conceded ?? 0,
          s.own_goals ?? 0,
          s.penalties_saved ?? 0,
          s.penalties_missed ?? 0,
          s.yellow_cards ?? 0,
          s.red_cards ?? 0,
          s.saves ?? 0,
          s.bonus ?? 0,
          s.bps ?? 0,
          parseFloat(s.influence ?? 0),
          parseFloat(s.creativity ?? 0),
          parseFloat(s.threat ?? 0),
          parseFloat(s.ict_index ?? 0),
        ]
      );
      saved++;
    }

    // Refresh manager_picks.points from the freshly saved stats.
    // This is needed because picks are saved before stats exist (points = 0),
    // and subsequent stat updates (frequent-load) never updated picks.points.
    await client.query(
      `UPDATE manager_picks mp
       SET points = pgs.total_points * mp.multiplier
       FROM player_gameweek_stats pgs
       WHERE mp.player_id = pgs.player_id
         AND mp.gameweek_id = pgs.gameweek_id
         AND mp.gameweek_id = $1`,
      [gameweek]
    );

    await client.query('COMMIT');
    return { success: true, message: `Saved stats for ${saved} players in gameweek ${gameweek}` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Save live (frequent) player stats to latest_player_gameweek_stats.
 * This table is overwritten on each frequent-load run.
 *
 * @param {number} gameweek
 */
const saveLatestPlayerStats = async (gameweek) => {
  const liveData = await fplApi.getLiveGameweekData(gameweek);

  if (!liveData || !liveData.elements) {
    throw new Error('Live gameweek data not found');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let saved = 0;
    for (const [playerId, data] of Object.entries(liveData.elements)) {
      if (!data.stats) continue;

      const s = data.stats;
      await client.query(
        `INSERT INTO latest_player_gameweek_stats (
           player_id, gameweek_id, total_points, minutes,
           goals_scored, assists, clean_sheets, goals_conceded,
           own_goals, penalties_saved, penalties_missed,
           yellow_cards, red_cards, saves, bonus, bps
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (player_id, gameweek_id) DO UPDATE SET
           total_points = $3, minutes = $4, goals_scored = $5,
           assists = $6, clean_sheets = $7, goals_conceded = $8,
           own_goals = $9, penalties_saved = $10, penalties_missed = $11,
           yellow_cards = $12, red_cards = $13, saves = $14,
           bonus = $15, bps = $16`,
        [
          parseInt(playerId),
          gameweek,
          s.total_points ?? 0,
          s.minutes ?? 0,
          s.goals_scored ?? 0,
          s.assists ?? 0,
          s.clean_sheets ?? 0,
          s.goals_conceded ?? 0,
          s.own_goals ?? 0,
          s.penalties_saved ?? 0,
          s.penalties_missed ?? 0,
          s.yellow_cards ?? 0,
          s.red_cards ?? 0,
          s.saves ?? 0,
          s.bonus ?? 0,
          s.bps ?? 0,
        ]
      );
      saved++;
    }

    await client.query('COMMIT');
    return { success: true, message: `Updated live stats for ${saved} players` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Save manager picks for a specific gameweek.
 */
const saveManagerPicks = async (managerId, gameweek) => {
  // Look up the FPL entry_id — the API needs this, not our internal manager_id
  const managerRow = await db.query(
    'SELECT entry_id FROM managers WHERE manager_id = $1',
    [managerId]
  );
  if (!managerRow.rows[0] || !managerRow.rows[0].entry_id) {
    throw new Error(`No entry_id found for manager_id ${managerId}`);
  }
  const entryId = managerRow.rows[0].entry_id;

  const managerPicks = await fplApi.getManagerPicks(entryId, gameweek);

  if (!managerPicks || !managerPicks.picks) {
    throw new Error('Manager picks not found');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Delete and re-insert — picks don't change much and this keeps it simple
    await client.query(
      'DELETE FROM manager_picks WHERE manager_id = $1 AND gameweek_id = $2',
      [managerId, gameweek]
    );

    for (const pick of managerPicks.picks) {
      await client.query(
        `INSERT INTO manager_picks (manager_id, gameweek_id, player_id, position,
           is_captain, is_vice_captain, multiplier)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          managerId,
          gameweek,
          pick.element,
          pick.position,
          pick.is_captain,
          pick.is_vice_captain,
          pick.multiplier,
        ]
      );
    }

    // Update points from existing stats
    await client.query(
      `UPDATE manager_picks mp
       SET points = pgs.total_points * mp.multiplier
       FROM player_gameweek_stats pgs
       WHERE mp.player_id = pgs.player_id
         AND mp.gameweek_id = pgs.gameweek_id
         AND mp.manager_id = $1
         AND mp.gameweek_id = $2`,
      [managerId, gameweek]
    );

    await client.query('COMMIT');
    return { success: true, message: 'Manager picks saved' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Get a manager's team with player details for a given gameweek.
 */
const getManagerTeam = async (managerId, gameweek) => {
  const result = await db.query(
    `SELECT
       mp.player_id, mp.position, mp.is_captain, mp.is_vice_captain, mp.multiplier,
       COALESCE(mp.points, pgs.total_points * mp.multiplier) as points,
       p.web_name, p.first_name, p.second_name, p.element_type, p.status,
       t.short_name as team_short_name,
       pgs.total_points, pgs.minutes, pgs.goals_scored, pgs.assists,
       pgs.clean_sheets, pgs.goals_conceded, pgs.own_goals,
       pgs.penalties_saved, pgs.penalties_missed,
       pgs.yellow_cards, pgs.red_cards, pgs.saves, pgs.bonus
     FROM manager_picks mp
     JOIN players p ON mp.player_id = p.player_id
     JOIN teams t ON p.team_id = t.fpl_team_id
     LEFT JOIN player_gameweek_stats pgs
       ON mp.player_id = pgs.player_id AND mp.gameweek_id = pgs.gameweek_id
     WHERE mp.manager_id = $1 AND mp.gameweek_id = $2
     ORDER BY mp.position`,
    [managerId, gameweek]
  );

  let totalPoints = 0;
  const players = result.rows.map((player) => {
    const points = parseInt(player.points) || 0;
    if (player.position <= 11) totalPoints += points;
    return { ...player, points };
  });

  return { manager_id: managerId, gameweek, players, total_points: totalPoints };
};

/**
 * Get player by ID including team name.
 */
const getPlayerById = async (playerId) => {
  const result = await db.query(
    `SELECT p.*, t.name as team_name, t.short_name as team_short_name
     FROM players p
     JOIN teams t ON p.team_id = t.fpl_team_id
     WHERE p.player_id = $1`,
    [playerId]
  );
  return result.rows[0] || null;
};

/**
 * Search players by name.
 */
const searchPlayers = async (query) => {
  const result = await db.query(
    `SELECT p.*, t.name as team_name, t.short_name as team_short_name
     FROM players p
     JOIN teams t ON p.team_id = t.fpl_team_id
     WHERE p.web_name ILIKE $1 OR p.first_name ILIKE $1 OR p.second_name ILIKE $1
     ORDER BY p.total_points DESC
     LIMIT 20`,
    [`%${query}%`]
  );
  return result.rows;
};

module.exports = {
  saveAllPlayers,
  savePlayerGameweekStats,
  saveLatestPlayerStats,
  saveManagerPicks,
  getManagerTeam,
  getPlayerById,
  searchPlayers,
};
