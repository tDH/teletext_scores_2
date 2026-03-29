/**
 * Scout service — server-side proxy for the OpenFPL Scout AI API (RapidAPI).
 *
 * Fetches per-player expected points for a given gameweek.
 * Results are cached for 1 hour: predictions for a future gameweek are stable
 * and the free tier only allows 10 requests/hour.
 *
 * Returns null (rather than throwing) when the API key is not configured,
 * so callers can treat missing predictions as a graceful no-op.
 */
const axios = require('axios');
const NodeCache = require('node-cache');
const config = require('../config');

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch player point predictions for a gameweek from OpenFPL Scout AI.
 *
 * @param {number} gameweek
 * @returns {Promise<Array<{ web_name: string, element_type: number, expected_points: number }>|null>}
 *   Array of player predictions, or null if API key is not configured or all retries fail.
 */
const getPlayerPredictions = async (gameweek) => {
  if (!config.scout.apiKey) {
    console.warn('[scout] OPENFPL_API_KEY not set — skipping predictions');
    return null;
  }

  const cacheKey = `scout_predictions_gw${gameweek}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(`${config.scout.apiBaseUrl}/api/gw/playerpoints`, {
        params: { gw: gameweek },
        headers: {
          'X-RapidAPI-Key': config.scout.apiKey,
          'X-RapidAPI-Host': config.scout.apiHost,
        },
        timeout: 15000,
      });

      const players = response.data?.players || [];
      cache.set(cacheKey, players);
      return players;
    } catch (err) {
      lastError = err;
      const statusCode = err.response?.status;
      // 4xx (except 429 rate-limit) are not retryable
      const isRetryable = !statusCode || statusCode >= 500 || statusCode === 429;
      if (!isRetryable || attempt === 3) break;
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }

  console.error('[scout] Failed to fetch predictions:', lastError?.message);
  return null;
};

module.exports = { getPlayerPredictions };
