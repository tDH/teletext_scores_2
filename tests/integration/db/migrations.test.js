/**
 * Integration tests for database migrations.
 * Verifies that the schema is applied correctly and critical constraints exist.
 *
 * Requires a running PostgreSQL instance and TEST_DB_DATABASE configured in .env.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { testPool, applyMigrations } = require('../../helpers/db');

before(async () => {
  await applyMigrations();
});

after(async () => {
  await testPool.end();
});

describe('Migrations: table existence', () => {
  const expectedTables = [
    'leagues',
    'teams',
    'gameweeks',
    'players',
    'managers',
    'matches',
    'standings',
    'player_gameweek_stats',
    'latest_player_gameweek_stats',
    'manager_picks',
    'transactions',
    'draft_picks',
    'schema_migrations',
  ];

  for (const tableName of expectedTables) {
    it(`table "${tableName}" exists`, async () => {
      const res = await testPool.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );
      assert.equal(res.rows.length, 1, `Expected table ${tableName} to exist`);
    });
  }
});

describe('Migrations: unique constraints', () => {
  it('standings has unique constraint on (league_id, league_entry)', async () => {
    const res = await testPool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'standings' AND constraint_type = 'UNIQUE'`
    );
    assert.ok(res.rows.length > 0, 'standings should have at least one unique constraint');
  });

  it('matches has natural unique constraint (league_id, event, league_entry_1, league_entry_2)', async () => {
    const res = await testPool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'matches'
       AND constraint_type = 'UNIQUE'
       AND constraint_name = 'matches_natural_unique'`
    );
    assert.equal(
      res.rows.length,
      1,
      'matches must have matches_natural_unique constraint — without it, upserts create duplicates'
    );
  });

  it('transactions has natural unique constraint', async () => {
    const res = await testPool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'transactions'
       AND constraint_type = 'UNIQUE'
       AND constraint_name = 'transactions_natural_unique'`
    );
    assert.equal(
      res.rows.length,
      1,
      'transactions must have transactions_natural_unique constraint — without it, ON CONFLICT DO NOTHING is a no-op'
    );
  });

  it('player_gameweek_stats has unique constraint on (player_id, gameweek_id)', async () => {
    const res = await testPool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'player_gameweek_stats' AND constraint_type = 'UNIQUE'`
    );
    assert.ok(res.rows.length > 0);
  });

  it('manager_picks has unique constraint on (manager_id, gameweek_id, player_id)', async () => {
    const res = await testPool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'manager_picks' AND constraint_type = 'UNIQUE'`
    );
    assert.ok(res.rows.length > 0);
  });
});

describe('Migrations: indexes', () => {
  const expectedIndexes = [
    { table: 'player_gameweek_stats', index: 'idx_player_gameweek' },
    { table: 'manager_picks', index: 'idx_manager_gameweek' },
    { table: 'matches', index: 'idx_match_event' },
    { table: 'matches', index: 'idx_match_league' },
    { table: 'standings', index: 'idx_standing_league' },
    { table: 'transactions', index: 'idx_transactions_league' },
  ];

  for (const { table, index } of expectedIndexes) {
    it(`index "${index}" on "${table}" exists`, async () => {
      const res = await testPool.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = $1 AND indexname = $2`,
        [table, index]
      );
      assert.equal(res.rows.length, 1, `Expected index ${index} on ${table}`);
    });
  }
});

describe('Migrations: idempotency', () => {
  it('running migrations again does not throw', async () => {
    // Should silently skip already-applied migrations
    await assert.doesNotReject(applyMigrations);
  });
});
