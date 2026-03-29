/**
 * Prediction service — generates AI predicted scores per manager per gameweek.
 *
 * Logic:
 *   1. Skip if gameweek < config.scout.predictionsStartGw (this season starts at GW32;
 *      future seasons default to GW1 by leaving PREDICTIONS_START_GW unset).
 *   2. Skip if predictions already exist for this gameweek (idempotent).
 *   3. Fetch player predictions from OpenFPL Scout AI via scout-service.
 *   4. For each manager, take their 15 squad picks and:
 *        - Match each player to Scout AI predictions by web_name (case-insensitive).
 *        - Pick the best 1 GK + best 10 outfield players by expected_points.
 *        - Apply 2× to the actual captain's predicted score.
 *   5. INSERT predicted scores into gw_predictions (one row per manager).
 */
const db = require('../db');
const scoutService = require('./scout-service');
const config = require('../config');

/**
 * Build a lookup map from lowercase web_name → expected_points.
 *
 * @param {Array} predictions - raw array from scout-service
 * @returns {Map<string, number>}
 */
function buildPredictionMap(predictions) {
  const map = new Map();
  for (const p of predictions) {
    if (p.web_name) {
      map.set(p.web_name.toLowerCase(), parseFloat(p.expected_points) || 0);
    }
  }
  return map;
}

/**
 * Select best 1 GK + best 10 outfield from a manager's picks,
 * apply captain 2× to the actual captain's expected points,
 * and return the summed predicted score.
 *
 * @param {Array} picks - rows from manager_picks joined with players
 * @param {Map<string, number>} predMap - web_name → expected_points
 * @returns {number}
 */
function calcManagerPrediction(picks, predMap) {
  // Attach expected_points to each pick
  const withPts = picks.map((pick) => ({
    ...pick,
    expected_points: predMap.get(pick.web_name.toLowerCase()) ?? 0,
    // Captain gets double predicted points
    effective_pts:
      pick.is_captain
        ? (predMap.get(pick.web_name.toLowerCase()) ?? 0) * 2
        : (predMap.get(pick.web_name.toLowerCase()) ?? 0),
  }));

  const gks      = withPts.filter((p) => p.element_type === 1);
  const outfield = withPts.filter((p) => p.element_type !== 1);

  // Best 1 GK
  const topGk = [...gks].sort((a, b) => b.effective_pts - a.effective_pts).slice(0, 1);

  // Best 10 outfield — captain's effective_pts already doubled so they sort highest naturally
  const topOutfield = [...outfield].sort((a, b) => b.effective_pts - a.effective_pts).slice(0, 10);

  const selected = [...topGk, ...topOutfield];
  const total = selected.reduce((sum, p) => sum + p.effective_pts, 0);

  return Math.round(total * 100) / 100; // 2 d.p.
}

/**
 * Generate and persist AI predictions for all managers in a league for a given gameweek.
 *
 * @param {number} leagueId
 * @param {number} gameweek
 * @returns {Promise<{ skipped: boolean, reason?: string, saved: number }>}
 */
const generatePredictions = async (leagueId, gameweek) => {
  // Only generate from the configured start gameweek onwards
  if (gameweek < config.scout.predictionsStartGw) {
    return {
      skipped: true,
      reason: `GW${gameweek} is before predictions start (GW${config.scout.predictionsStartGw})`,
      saved: 0,
    };
  }

  // Idempotency: skip if we already have predictions for this gameweek
  const existing = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM gw_predictions gp
     JOIN managers m ON m.manager_id = gp.manager_id
     WHERE m.league_id = $1 AND gp.gameweek_id = $2`,
    [leagueId, gameweek]
  );
  if (parseInt(existing.rows[0].cnt, 10) > 0) {
    return {
      skipped: true,
      reason: `Predictions already exist for GW${gameweek}`,
      saved: 0,
    };
  }

  // Fetch player predictions from Scout AI
  const rawPredictions = await scoutService.getPlayerPredictions(gameweek);
  if (!rawPredictions) {
    return {
      skipped: true,
      reason: 'Scout AI API unavailable — no fallback (predictions omitted)',
      saved: 0,
    };
  }

  const predMap = buildPredictionMap(rawPredictions);

  // Fetch all picks for this league + gameweek in one query
  const picksResult = await db.query(
    `SELECT
       mp.manager_id,
       mp.is_captain,
       mp.is_vice_captain,
       mp.position,
       p.web_name,
       p.element_type
     FROM manager_picks mp
     JOIN players p ON p.player_id = mp.player_id
     JOIN managers m ON m.manager_id = mp.manager_id
     WHERE m.league_id = $1
       AND mp.gameweek_id = $2`,
    [leagueId, gameweek]
  );

  if (picksResult.rows.length === 0) {
    return {
      skipped: true,
      reason: `No picks found for league ${leagueId} GW${gameweek}`,
      saved: 0,
    };
  }

  // Group picks by manager
  const picksByManager = new Map();
  for (const row of picksResult.rows) {
    if (!picksByManager.has(row.manager_id)) {
      picksByManager.set(row.manager_id, []);
    }
    picksByManager.get(row.manager_id).push(row);
  }

  // Calculate and save predictions
  let saved = 0;
  for (const [managerId, picks] of picksByManager) {
    const predictedScore = calcManagerPrediction(picks, predMap);
    await db.query(
      `INSERT INTO gw_predictions (manager_id, gameweek_id, predicted_score, source)
       VALUES ($1, $2, $3, 'openfpl')
       ON CONFLICT (manager_id, gameweek_id) DO NOTHING`,
      [managerId, gameweek, predictedScore]
    );
    saved++;
  }

  return { skipped: false, saved };
};

/**
 * Retrieve saved predictions for a gameweek.
 *
 * @param {number} gameweek
 * @returns {Promise<Array<{ manager_id: number, predicted_score: number }>>}
 */
const getPredictionsForGameweek = async (gameweek) => {
  const result = await db.query(
    `SELECT manager_id, predicted_score
     FROM gw_predictions
     WHERE gameweek_id = $1`,
    [gameweek]
  );
  return result.rows;
};

module.exports = { generatePredictions, getPredictionsForGameweek };
