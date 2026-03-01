/**
 * Integration tests for league routes.
 * Uses the test database, seeds minimal data, and calls the Express app.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Point to test DB
process.env.DB_DATABASE = process.env.TEST_DB_DATABASE || 'teletext_scores_2_test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FPL_LEAGUE_ID = '44363';
process.env.FOOTBALL_API_KEY = 'test_key';
process.env.NODE_ENV = 'test';

const { testPool, applyMigrations, clearAll, seedLeague, seedGameweek, seedManager } =
  require('../../helpers/db');

let server;
let baseUrl;

before(async () => {
  await applyMigrations();

  // Start the Express app on a random port for testing
  const { app } = require('../../../server/server');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await testPool.end();
});

beforeEach(async () => {
  await clearAll();
});

// Helper to make GET requests
const get = (path) =>
  new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });

describe('GET /api/config', () => {
  it('returns leagueId from config', async () => {
    const res = await get('/api/config');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.leagueId === 'number', 'leagueId should be a number');
  });
});

describe('GET /api/league/:leagueId/db', () => {
  it('returns 404 when league not in database', async () => {
    const res = await get('/api/league/99999/db');
    assert.equal(res.status, 404);
  });

  it('returns league data when seeded', async () => {
    await seedLeague(44363, 'Test League');

    const res = await get('/api/league/44363/db');
    assert.equal(res.status, 200);
    assert.equal(res.body.league.league_id, 44363);
    assert.equal(res.body.league.name, 'Test League');
    assert.ok(Array.isArray(res.body.managers));
    assert.ok(Array.isArray(res.body.matches));
    assert.ok(Array.isArray(res.body.standings));
  });

  it('returns 400 for invalid league ID', async () => {
    const res = await get('/api/league/not-a-number/db');
    assert.equal(res.status, 400);
  });
});

describe('GET /api/league/:leagueId/transactions', () => {
  it('returns empty array when no transactions exist', async () => {
    await seedLeague(44363);

    const res = await get('/api/league/44363/transactions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });
});

describe('GET /api/player/search', () => {
  it('returns 400 when query is too short', async () => {
    const res = await get('/api/player/search?query=ab');
    assert.equal(res.status, 400);
  });

  it('returns empty array when no players match', async () => {
    const res = await get('/api/player/search?query=Salah');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('GET /api/player/:playerId', () => {
  it('returns 404 when player not in database', async () => {
    const res = await get('/api/player/999999');
    assert.equal(res.status, 404);
  });
});
