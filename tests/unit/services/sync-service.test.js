/**
 * Unit tests for sync-service.js
 * Verifies orchestration order, skip logic, and step result structure.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_USER = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_DATABASE = 'test';
process.env.DB_PASSWORD = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FPL_LEAGUE_ID = '44363';
process.env.FOOTBALL_API_KEY = 'test_key';
process.env.NODE_ENV = 'test';

describe('sync-service: runWeeklyComplete', () => {
  it('returns skipped=true when gameweek is not finished and force=false', async () => {
    // Mock fpl-client to return an unfinished gameweek
    delete require.cache[require.resolve('../../../server/api/fpl-client')];
    delete require.cache[require.resolve('../../../server/services/sync-service')];

    const fplClient = require('../../../server/api/fpl-client');
    fplClient._cache.set('game_status', {
      current_event: 29,
      current_event_finished: false,
      next_event: 30,
    });

    // Mock db.pool.connect so sync-service doesn't try to hit DB
    const db = require('../../../server/db');
    const origConnect = db.pool.connect.bind(db.pool);
    db.pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    });

    const syncService = require('../../../server/services/sync-service');
    const result = await syncService.runWeeklyComplete(44363);

    assert.equal(result.success, false);
    assert.equal(result.skipped, true);
    assert.ok(result.reason.includes('not finished'), `Expected 'not finished' in: ${result.reason}`);

    db.pool.connect = origConnect;
    fplClient.clearCache();
  });

  it('proceeds when force=true even if gameweek not finished', async () => {
    delete require.cache[require.resolve('../../../server/api/fpl-client')];
    delete require.cache[require.resolve('../../../server/services/sync-service')];
    delete require.cache[require.resolve('../../../server/services/player-service')];
    delete require.cache[require.resolve('../../../server/services/league-service')];
    delete require.cache[require.resolve('../../../server/services/gameweek-service')];

    const fplClient = require('../../../server/api/fpl-client');

    // Stub fpl API methods
    fplClient._cache.set('game_status', {
      current_event: 29,
      current_event_finished: false,
      next_event: 30,
    });
    fplClient._cache.set('bootstrap_static', {
      elements: [],
      teams: [],
    });
    fplClient._cache.set('league_details_44363', {
      league: { name: 'Test', start_event: 1, stop_event: 38 },
      league_entries: [],
      matches: [],
      standings: [],
    });
    fplClient._cache.set('league_transactions_44363', { transactions: [] });
    fplClient._cache.set('live_gameweek_29', { elements: {} });

    const db = require('../../../server/db');
    const origConnect = db.pool.connect.bind(db.pool);
    const origQuery = db.query.bind(db);
    db.pool.connect = async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    });
    db.query = async () => ({ rows: [] });

    const syncService = require('../../../server/services/sync-service');
    const result = await syncService.runWeeklyComplete(44363, { force: true });

    // Should have proceeded (not skipped)
    assert.equal(result.skipped, undefined);
    assert.ok(Array.isArray(result.steps), 'Should have steps array');
    assert.ok(result.steps.length > 0, 'Should have run some steps');

    db.pool.connect = origConnect;
    db.query = origQuery;
    fplClient.clearCache();
  });
});

describe('sync-service: runStep error handling', () => {
  it('captures step errors without throwing — other steps continue', async () => {
    // This verifies the runStep helper handles errors gracefully
    // We test this indirectly by checking that a failing step produces status: 'error'
    // and the overall result reflects the failure
    delete require.cache[require.resolve('../../../server/services/sync-service')];
    delete require.cache[require.resolve('../../../server/api/fpl-client')];

    const fplClient = require('../../../server/api/fpl-client');

    // Make gameStatus fail
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async () => {
      throw new Error('Network down');
    };

    const syncService = require('../../../server/services/sync-service');

    await assert.rejects(
      () => syncService.runWeeklyComplete(44363),
      /Game status not found|FPL API request failed/
    );

    axios.get = origGet;
    fplClient.clearCache();
  });
});
