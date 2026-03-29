/**
 * Sync service — orchestrates all data loading operations.
 *
 * Extracted from the original weekly-load-complete.js which mixed orchestration
 * logic with CLI argument parsing and pool.end() calls (which caused issues
 * when run from cron as imported modules).
 *
 * Each method returns a structured result so callers can log/test without
 * parsing console output.
 */
const fplApi = require('../api/fpl-client');
const playerService = require('./player-service');
const leagueService = require('./league-service');
const gameweekService = require('./gameweek-service');
const predictionService = require('./prediction-service');
const db = require('../db');

/**
 * Run a single sync step and capture timing + errors.
 *
 * @param {string} name - step name for logging
 * @param {Function} fn - async function to run
 * @returns {{ name, status, message, duration }}
 */
const runStep = async (name, fn) => {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      name,
      status: 'ok',
      message: typeof result === 'string' ? result : (result?.message || 'ok'),
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'error',
      message: err.message,
      duration: Date.now() - start,
    };
  }
};

/**
 * One-time load: league info, managers, teams, players, draft picks.
 * Run once at the start of the season.
 *
 * @param {number} leagueId
 */
const runOneTimeLoad = async (leagueId) => {
  const steps = [];

  steps.push(await runStep('save-league-details', () => leagueService.saveLeagueDetails(leagueId)));
  steps.push(await runStep('save-all-players', () => playerService.saveAllPlayers()));
  steps.push(await runStep('save-draft-picks', () => leagueService.saveDraftPicks(leagueId)));

  const success = steps.every((s) => s.status === 'ok');
  return { success, steps };
};

/**
 * Weekly complete load: run after a gameweek finishes.
 * Updates gameweeks, players, matches, standings, transactions, player stats.
 *
 * @param {number} leagueId
 * @param {{ force?: boolean }} options
 */
const runWeeklyComplete = async (leagueId, { force = false } = {}) => {
  const steps = [];

  // Get game status once — used throughout
  const gameStatus = await fplApi.getGameStatus();
  if (!gameStatus || !gameStatus.current_event) {
    throw new Error('Game status not found or current_event not available');
  }

  const currentGameweek = gameStatus.current_event;
  const isFinished = gameStatus.current_event_finished;

  if (!isFinished && !force) {
    return {
      success: false,
      skipped: true,
      reason: `Gameweek ${currentGameweek} is not finished. Pass force=true to override.`,
      steps: [],
    };
  }

  // 1. Sync gameweeks
  steps.push(
    await runStep('sync-gameweeks', async () => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await gameweekService.syncGameweeksFromGameStatus(gameStatus, client);
        await client.query('COMMIT');
        return `Synced gameweeks around GW${currentGameweek}`;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })
  );

  // 2. Update players
  steps.push(await runStep('save-all-players', () => playerService.saveAllPlayers()));

  // 3. Matches + standings
  steps.push(
    await runStep('update-matches-standings', async () => {
      const result = await leagueService.updateMatchesAndStandings(leagueId, currentGameweek);
      return `Updated ${result.matchesUpdated} matches, ${result.standingsUpdated} standings`;
    })
  );

  // 4. Transactions
  steps.push(
    await runStep('save-transactions', async () => {
      const result = await leagueService.saveTransactions(leagueId, currentGameweek);
      return `Saved ${result.saved} transactions`;
    })
  );

  // 5. Player gameweek stats
  steps.push(
    await runStep('save-player-stats', async () => {
      const result = await playerService.savePlayerGameweekStats(currentGameweek);
      return result.message;
    })
  );

  const success = steps.every((s) => s.status === 'ok');
  return { success, gameweek: currentGameweek, steps };
};

/**
 * Weekly start load: run before a new gameweek begins.
 * Syncs players first (catches new signings), then manager picks.
 *
 * Player sync runs first so that any new FPL player IDs introduced since the
 * last load exist in the players table before picks or live stats reference them.
 * Without this, new signings trigger FK constraint violations in frequent-load.
 *
 * @param {number} leagueId
 */
const runWeeklyStart = async (leagueId) => {
  const steps = [];

  const gameStatus = await fplApi.getGameStatus();
  if (!gameStatus || !gameStatus.current_event) {
    throw new Error('Game status not found');
  }

  const currentGameweek = gameStatus.current_event;

  // 1. Sync players + teams first — ensures any new signings are in the DB
  //    before picks or live stats try to reference them via FK
  steps.push(await runStep('save-all-players', () => playerService.saveAllPlayers()));

  // Only proceed with picks if player sync succeeded
  if (steps[0].status === 'ok') {
    // 2. Manager picks for the new gameweek
    const managersResult = await db.query(
      'SELECT manager_id FROM managers WHERE league_id = $1',
      [leagueId]
    );

    for (const { manager_id } of managersResult.rows) {
      steps.push(
        await runStep(`save-picks-manager-${manager_id}`, () =>
          playerService.saveManagerPicks(manager_id, currentGameweek)
        )
      );
    }
  }

  // 3. AI predictions — runs after picks are saved; skips gracefully if API key
  //    is absent, GW is below the start threshold, or predictions already exist.
  steps.push(
    await runStep('generate-predictions', async () => {
      const result = await predictionService.generatePredictions(leagueId, currentGameweek);
      if (result.skipped) return `Skipped: ${result.reason}`;
      return `Generated predictions for ${result.saved} managers`;
    })
  );

  const success = steps.every((s) => s.status === 'ok');
  return { success, gameweek: currentGameweek, steps };
};

/**
 * Frequent load: run every 5 minutes during live matches.
 * Syncs players first (catches any new signings added since weekly-start),
 * then updates latest_player_gameweek_stats with live data.
 *
 * The player sync prevents FK violations when a newly added FPL player appears
 * in the live gameweek API response before we've saved them to the players table.
 * The bootstrap-static response is cached (5 min TTL) so this adds minimal overhead.
 */
const runFrequentLoad = async () => {
  const steps = [];

  const gameStatus = await fplApi.getGameStatus();
  if (!gameStatus || !gameStatus.current_event) {
    throw new Error('Game status not found');
  }

  const currentGameweek = gameStatus.current_event;

  // Sync players first — catches new signings added to FPL mid-week
  steps.push(await runStep('save-all-players', () => playerService.saveAllPlayers()));

  // Only proceed with live stats if player sync succeeded
  if (steps[0].status === 'ok') {
    // Write to player_gameweek_stats (permanent — used by matchup page)
    steps.push(
      await runStep('save-player-stats', () =>
        playerService.savePlayerGameweekStats(currentGameweek)
      )
    );
    // Also write to latest_player_gameweek_stats (live overlay table)
    steps.push(
      await runStep('save-latest-player-stats', () =>
        playerService.saveLatestPlayerStats(currentGameweek)
      )
    );
  }

  const success = steps.every((s) => s.status === 'ok');
  return { success, gameweek: currentGameweek, steps };
};

module.exports = {
  runOneTimeLoad,
  runWeeklyComplete,
  runWeeklyStart,
  runFrequentLoad,
};
