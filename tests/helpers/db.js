/**
 * Test database helpers.
 * Uses a separate test database so integration tests never touch production data.
 *
 * Requires TEST_DB_DATABASE env var (defaults to teletext_scores_2_test).
 */
require('dotenv').config();

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const testPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.TEST_DB_DATABASE || 'teletext_scores_2_test',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

const MIGRATIONS_DIR = path.join(__dirname, '../../server/db/migrations');

/**
 * Apply all migrations to the test database.
 * Safe to call multiple times — tracks applied migrations.
 */
async function applyMigrations() {
  const client = await testPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Clear all data from test tables (preserves schema).
 * Call this in beforeEach to keep tests isolated.
 */
async function clearAll() {
  await testPool.query(`
    TRUNCATE TABLE
      draft_picks, transactions, manager_picks,
      latest_player_gameweek_stats, player_gameweek_stats,
      standings, matches, managers, players, gameweeks, teams, leagues
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Seed a minimal league row.
 */
async function seedLeague(leagueId = 44363, name = 'Test League') {
  await testPool.query(
    `INSERT INTO leagues (league_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [leagueId, name]
  );
}

/**
 * Seed a minimal gameweek row.
 */
async function seedGameweek(gameweekId = 1, overrides = {}) {
  const { isCurrent = false, finished = false } = overrides;
  await testPool.query(
    `INSERT INTO gameweeks (gameweek_id, name, is_current, is_next, is_previous, finished, data_checked)
     VALUES ($1, $2, $3, false, false, $4, false)
     ON CONFLICT DO NOTHING`,
    [gameweekId, `Gameweek ${gameweekId}`, isCurrent, finished]
  );
}

/**
 * Seed a manager row. manager_id and entry_id are both set to id for simplicity.
 */
async function seedManager(managerId, leagueId = 44363) {
  await testPool.query(
    `INSERT INTO managers (manager_id, entry_id, entry_name, player_first_name, player_last_name, short_name, league_id)
     VALUES ($1, $1, $2, 'Test', 'Manager', 'TST', $3)
     ON CONFLICT DO NOTHING`,
    [managerId, `Manager ${managerId}`, leagueId]
  );
}

module.exports = {
  testPool,
  applyMigrations,
  clearAll,
  seedLeague,
  seedGameweek,
  seedManager,
};
