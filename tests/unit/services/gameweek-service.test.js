/**
 * Unit tests for gameweek-service.js
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Set required env vars before requiring config.js
process.env.DB_USER = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_DATABASE = 'test';
process.env.DB_PASSWORD = 'test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FPL_LEAGUE_ID = '44363';
process.env.FOOTBALL_API_KEY = 'test_key';
process.env.NODE_ENV = 'test';

describe('syncGameweeksFromGameStatus', () => {
  it('throws if current_event is missing from gameStatus', async () => {
    // We need to mock db. Use a fake client.
    const gameweekService = require('../../../server/services/gameweek-service');

    const fakeClient = {
      queries: [],
      query: async (text, params) => {
        fakeClient.queries.push({ text, params });
        return { rows: [], rowCount: 0 };
      },
    };

    await assert.rejects(
      () => gameweekService.syncGameweeksFromGameStatus({}, fakeClient),
      /current_event is required/
    );
  });

  it('resets all flags and upserts current, next, and previous gameweeks', async () => {
    delete require.cache[require.resolve('../../../server/services/gameweek-service')];
    const gameweekService = require('../../../server/services/gameweek-service');

    const queries = [];
    const fakeClient = {
      query: async (text, params) => {
        queries.push({ text: text.trim().substring(0, 60), params });
        return { rows: [], rowCount: 0 };
      },
    };

    await gameweekService.syncGameweeksFromGameStatus(
      { current_event: 10, next_event: 11, current_event_finished: true },
      fakeClient
    );

    // First query should reset all flags
    assert.ok(queries[0].text.includes('UPDATE gameweeks'), 'Should reset all flags first');

    // Should have upserted current (10), next (11), and previous (9)
    const upsertedIds = queries
      .filter((q) => q.text.includes('INSERT INTO gameweeks'))
      .map((q) => q.params && q.params[0]);

    assert.ok(upsertedIds.includes(10), 'Should upsert current gameweek (10)');
    assert.ok(upsertedIds.includes(11), 'Should upsert next gameweek (11)');
    assert.ok(upsertedIds.includes(9), 'Should upsert previous gameweek (9)');
  });

  it('does not upsert previous gameweek when current_event is 1', async () => {
    delete require.cache[require.resolve('../../../server/services/gameweek-service')];
    const gameweekService = require('../../../server/services/gameweek-service');

    const queries = [];
    const fakeClient = {
      query: async (text, params) => {
        queries.push({ text: text.trim().substring(0, 60), params });
        return { rows: [], rowCount: 0 };
      },
    };

    await gameweekService.syncGameweeksFromGameStatus(
      { current_event: 1, next_event: 2, current_event_finished: false },
      fakeClient
    );

    const upsertedIds = queries
      .filter((q) => q.text.includes('INSERT INTO gameweeks'))
      .map((q) => q.params && q.params[0]);

    assert.ok(upsertedIds.includes(1), 'Should upsert GW1');
    assert.ok(upsertedIds.includes(2), 'Should upsert GW2');
    assert.ok(!upsertedIds.includes(0), 'Should NOT upsert GW0');
  });
});
