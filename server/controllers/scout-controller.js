const predictionService = require('../services/prediction-service');
const config = require('../config');

/**
 * GET /api/scout/gw/:gw/predictions
 *
 * Returns saved AI predicted scores for all managers for a given gameweek.
 * Returns an empty predictions object (not a 404) when no predictions exist
 * so the frontend can distinguish "predictions not generated yet" from an error.
 */
const getPredictions = async (req, res, next) => {
  try {
    const gameweek = parseInt(req.params.gw, 10);
    if (!gameweek || gameweek < 1) {
      return res.status(400).json({ message: 'Invalid gameweek' });
    }

    const rows = await predictionService.getPredictionsForGameweek(gameweek);

    // Convert array to { manager_id: predicted_score } map for easy client lookup
    const predictions = {};
    for (const row of rows) {
      predictions[row.manager_id] = parseFloat(row.predicted_score);
    }

    res.json({ gameweek, predictions });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/scout/gw/:gw/predictions/generate  (admin only)
 *
 * Manually trigger prediction generation for a gameweek.
 * Useful for testing or re-running after an API outage.
 */
const generatePredictions = async (req, res, next) => {
  try {
    const gameweek = parseInt(req.params.gw, 10);
    if (!gameweek || gameweek < 1) {
      return res.status(400).json({ message: 'Invalid gameweek' });
    }

    const leagueId = config.fpl.leagueId;
    const result = await predictionService.generatePredictions(leagueId, gameweek);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getPredictions, generatePredictions };
