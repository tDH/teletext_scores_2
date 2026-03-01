/**
 * Unit tests for server/api/fpl-client.js
 *
 * These tests mock axios so no real HTTP requests are made.
 * They verify the retry, caching, and stale-fallback behaviour
 * that was entirely absent from the original fpl-api.js.
 */
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Set required env vars before config.js is loaded
process.env.DB_USER = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_DATABASE = 'test';
process.env.DB_PASSWORD = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FPL_LEAGUE_ID = '44363';
process.env.FOOTBALL_API_KEY = 'test_key';
process.env.NODE_ENV = 'test';

// We need to reset module cache between tests because fpl-client uses module-level caches
// Node test runner doesn't have jest.resetModules() so we use a helper approach:
// We test the behaviour via the exported _cache objects and mock axios.

describe('fpl-client: cache hit', () => {
  it('does not call axios when data is already cached', async () => {
    // Use a fresh require on each test block by deleting from cache
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    let axiosCallCount = 0;
    // Mock axios.get
    const axios = require('axios');
    const originalGet = axios.get;
    axios.get = async () => {
      axiosCallCount++;
      return { data: { test: 'data' } };
    };

    const client = require('../../../server/api/fpl-client');
    // Warm the cache with a direct set
    client._cache.set('game_status', { status: 'cached' });

    const result = await client.getGameStatus();
    assert.deepEqual(result, { status: 'cached' });
    assert.equal(axiosCallCount, 0, 'axios.get should not be called when data is cached');

    axios.get = originalGet;
    client.clearCache();
  });
});

describe('fpl-client: successful fetch', () => {
  it('fetches data, caches it, and returns it', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const axios = require('axios');
    const originalGet = axios.get;
    let callCount = 0;
    axios.get = async () => {
      callCount++;
      return { data: { current_event: 29, status: 'ok' } };
    };

    const client = require('../../../server/api/fpl-client');
    const result = await client.getGameStatus();

    assert.equal(callCount, 1);
    assert.equal(result.current_event, 29);

    // Second call should use cache
    const result2 = await client.getGameStatus();
    assert.equal(callCount, 1, 'Should not call axios again on second request');
    assert.equal(result2.current_event, 29);

    axios.get = originalGet;
    client.clearCache();
  });
});

describe('fpl-client: retry on 500', () => {
  it('retries up to 3 times on server errors and succeeds on 3rd attempt', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const axios = require('axios');
    const originalGet = axios.get;
    let callCount = 0;

    axios.get = async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error('Server error');
        err.response = { status: 500 };
        throw err;
      }
      return { data: { recovered: true } };
    };

    const client = require('../../../server/api/fpl-client');

    // Speed up retries for tests by temporarily overriding sleep
    // We mock the module-level sleep by using a very short delay
    // The actual test just needs to verify it eventually succeeds
    const result = await client.getGameStatus();

    assert.equal(callCount, 3, 'Should have tried 3 times');
    assert.equal(result.recovered, true);

    axios.get = originalGet;
    client.clearCache();
  });

  it('does not retry on 404 errors', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const axios = require('axios');
    const originalGet = axios.get;
    let callCount = 0;

    axios.get = async () => {
      callCount++;
      const err = new Error('Not found');
      err.response = { status: 404 };
      throw err;
    };

    const client = require('../../../server/api/fpl-client');

    await assert.rejects(
      () => client.getGameStatus(),
      (err) => {
        assert.equal(callCount, 1, 'Should only try once on 404');
        return true;
      }
    );

    axios.get = originalGet;
    client.clearCache();
  });
});

describe('fpl-client: stale cache fallback', () => {
  it('returns stale data with _isStale flag when all retries fail', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const axios = require('axios');
    const originalGet = axios.get;

    // First call succeeds and populates the stale cache
    let phase = 'working';
    axios.get = async () => {
      if (phase === 'working') {
        return { data: { event: 25, staleTest: true } };
      }
      const err = new Error('API down');
      err.response = { status: 503 };
      throw err;
    };

    const client = require('../../../server/api/fpl-client');

    // Populate stale cache
    await client.getGameStatus();

    // Clear live cache but keep stale cache
    client._cache.flushAll();

    // Now simulate API being down
    phase = 'broken';

    const result = await client.getGameStatus();

    assert.equal(result._isStale, true, 'Should flag data as stale');
    assert.equal(result.staleTest, true, 'Should return the original data');
    assert.ok(typeof result._staleAgeMinutes === 'number');

    axios.get = originalGet;
    client.clearCache();
  });

  it('throws a structured error when no stale data exists and all retries fail', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const axios = require('axios');
    const originalGet = axios.get;

    axios.get = async () => {
      const err = new Error('Total failure');
      err.response = { status: 503 };
      throw err;
    };

    const client = require('../../../server/api/fpl-client');

    await assert.rejects(
      () => client.getGameStatus(),
      (err) => {
        assert.ok(err.message.includes('FPL API request failed'), 'Should have structured message');
        assert.ok(err.endpoint, 'Should include endpoint');
        assert.ok(err.cacheKey, 'Should include cacheKey');
        return true;
      }
    );

    axios.get = originalGet;
    client.clearCache();
  });
});

describe('fpl-client: clearCache', () => {
  it('clears a specific key from both caches', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const client = require('../../../server/api/fpl-client');
    client._cache.set('game_status', { cached: true });
    client._staleCache.set('game_status', { data: { cached: true }, fetchedAt: Date.now() });

    client.clearCache('game_status');

    assert.equal(client._cache.get('game_status'), undefined);
    assert.equal(client._staleCache.get('game_status'), undefined);
  });

  it('flushes all caches when called with no key', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const client = require('../../../server/api/fpl-client');
    client._cache.set('game_status', { a: 1 });
    client._cache.set('bootstrap_static', { b: 2 });

    client.clearCache();

    assert.equal(client._cache.get('game_status'), undefined);
    assert.equal(client._cache.get('bootstrap_static'), undefined);
  });
});
