/**
 * FPL Draft API client.
 *
 * Improvements over the original fpl-api.js:
 * - Retry with exponential backoff (3 attempts, 1s/2s/4s) on server errors
 * - Stale cache fallback: if all retries fail but we have old data, return it
 *   with an _isStale flag so the UI can show a warning
 * - Structured error objects with endpoint info for easier debugging
 * - No console.log on every cache hit (too noisy in production)
 */
const axios = require('axios');
const NodeCache = require('node-cache');
const config = require('../config');

// Live cache: data expires normally
const cache = new NodeCache({ stdTTL: config.cache.defaultTtl });

// Stale cache: longer TTL, used as fallback when live fetch fails
// Stores { data, fetchedAt } so the caller knows how old the data is
const staleCache = new NodeCache({ stdTTL: 86400 }); // 24 hours

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch data from a URL with caching, retry, and stale fallback.
 *
 * @param {string} url
 * @param {string} cacheKey
 * @param {number} ttl - cache TTL in seconds
 * @param {number} retries - max attempts (default 3)
 * @returns {Promise<any>} response data, possibly with _isStale: true
 */
const fetchWithRetry = async (url, cacheKey, ttl = config.cache.defaultTtl, retries = 3) => {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (config.isDev) {
        console.log(`[fpl-client] Fetching ${cacheKey} (attempt ${attempt})`);
      }
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      cache.set(cacheKey, data, ttl);
      staleCache.set(cacheKey, { data, fetchedAt: Date.now() });

      return data;
    } catch (err) {
      lastError = err;
      const statusCode = err.response?.status;
      // Only retry on network errors or 5xx; don't retry 4xx (bad request, not found)
      const isRetryable = !statusCode || statusCode >= 500;
      if (!isRetryable || attempt === retries) break;

      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`[fpl-client] Attempt ${attempt} failed for ${cacheKey}, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  // All retries exhausted — try stale cache before giving up
  const stale = staleCache.get(cacheKey);
  if (stale) {
    const ageMinutes = Math.round((Date.now() - stale.fetchedAt) / 60000);
    console.warn(
      `[fpl-client] Live fetch failed for ${cacheKey}, returning stale data (${ageMinutes}m old)`
    );
    return { ...stale.data, _isStale: true, _staleAgeMinutes: ageMinutes };
  }

  // No stale data either — throw a structured error
  const error = new Error(`FPL API request failed: ${cacheKey}`);
  error.endpoint = url;
  error.cacheKey = cacheKey;
  error.statusCode = lastError?.response?.status;
  error.cause = lastError;
  throw error;
};

// ── API methods ──────────────────────────────────────────────────────────────

const getGameStatus = () =>
  fetchWithRetry(`${config.fpl.apiBaseUrl}/game`, 'game_status');

const getBootstrapStatic = () =>
  fetchWithRetry(`${config.fpl.apiBaseUrl}/bootstrap-static`, 'bootstrap_static');

const getLeagueDetails = (leagueId) =>
  fetchWithRetry(
    `${config.fpl.apiBaseUrl}/league/${leagueId}/details`,
    `league_details_${leagueId}`
  );

const getManagerPicks = (entryId, gameweek) =>
  fetchWithRetry(
    `${config.fpl.apiBaseUrl}/entry/${entryId}/event/${gameweek}`,
    `manager_picks_${entryId}_${gameweek}`,
    config.cache.managerPicksTtl
  );

const getLiveGameweekData = (gameweek) =>
  fetchWithRetry(
    `${config.fpl.apiBaseUrl}/event/${gameweek}/live`,
    `live_gameweek_${gameweek}`,
    config.cache.liveTtl
  );

const getLeagueTransactions = (leagueId) =>
  fetchWithRetry(
    `${config.fpl.apiBaseUrl}/draft/league/${leagueId}/transactions`,
    `league_transactions_${leagueId}`
  );

const getDraftPicks = (leagueId) =>
  fetchWithRetry(
    `${config.fpl.apiBaseUrl}/draft/${leagueId}/choices`,
    `draft_picks_${leagueId}`,
    config.cache.staticTtl
  );

const clearCache = (key) => {
  if (key) {
    cache.del(key);
    staleCache.del(key);
  } else {
    cache.flushAll();
    staleCache.flushAll();
  }
};

module.exports = {
  getGameStatus,
  getBootstrapStatic,
  getLeagueDetails,
  getManagerPicks,
  getLiveGameweekData,
  getLeagueTransactions,
  getDraftPicks,
  clearCache,
  // Exposed for testing
  _cache: cache,
  _staleCache: staleCache,
};
