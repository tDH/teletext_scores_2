/**
 * Fixtures service — server-side proxy for the football API.
 *
 * Moves the RapidAPI key from client JS (where it was visible to anyone)
 * to this server-side service. Clients call /api/fixtures instead.
 *
 * Uses the same retry + stale cache pattern as fpl-client.js.
 */
const axios = require('axios');
const NodeCache = require('node-cache');
const config = require('../config');

const cache = new NodeCache({ stdTTL: 300 }); // 5 min for fixtures
const staleCache = new NodeCache({ stdTTL: 3600 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url, params, cacheKey, retries = 3) => {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        params,
        headers: {
          'x-apisports-key': config.football.apiKey,
        },
        timeout: 10000,
      });

      cache.set(cacheKey, response.data);
      // Only cache non-empty responses in stale cache — avoids serving an
      // empty result for up to 1 hour if the API hadn't published fixtures yet
      // when the first request of the day came in.
      if (response.data.results > 0) {
        staleCache.set(cacheKey, { data: response.data, fetchedAt: Date.now() });
      }
      return response.data;
    } catch (err) {
      lastError = err;
      const statusCode = err.response?.status;
      const isRetryable = !statusCode || statusCode >= 500;
      if (!isRetryable || attempt === retries) break;
      await sleep(1000 * Math.pow(2, attempt - 1));
    }
  }

  // Stale fallback
  const stale = staleCache.get(cacheKey);
  if (stale) {
    return { ...stale.data, _isStale: true };
  }

  throw lastError;
};

/**
 * Get fixtures from football API.
 *
 * @param {{ league: string|number, date?: string, season?: string }} options
 */
const getFixtures = (options) => {
  const { league, date, season, id } = options;

  // By-ID fetches include the full events array; by-league fetches do not.
  // Use separate cache keys so they never overwrite each other.
  if (id) {
    return fetchWithRetry(
      `https://${config.football.apiHost}/fixtures`,
      { id },
      `fixtures_id_${id}`
    );
  }

  const params = { league };
  if (date) params.date = date;
  if (season) params.season = season;

  const cacheKey = `fixtures_${league}_${date || 'nodate'}_${season || 'noseason'}`;
  return fetchWithRetry(
    `https://${config.football.apiHost}/fixtures`,
    params,
    cacheKey
  );
};

/**
 * Get standings for a league from football API.
 */
const getStandings = (league, season) => {
  const cacheKey = `standings_${league}_${season}`;
  return fetchWithRetry(
    `https://${config.football.apiHost}/standings`,
    { league, season },
    cacheKey
  );
};

module.exports = { getFixtures, getStandings };
