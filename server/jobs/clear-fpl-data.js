/**
 * Clear FPL data for a given league.
 *
 * Deletes all league-scoped rows for the specified league ID in the correct
 * foreign key order. Leaves global tables untouched (players, teams,
 * gameweeks, player_gameweek_stats, latest_player_gameweek_stats).
 *
 * Usage:
 *   node server/jobs/clear-fpl-data.js           # uses FPL_LEAGUE_ID from .env
 *   node server/jobs/clear-fpl-data.js 44363     # explicit league ID
 */

require('dotenv').config();
const db = require('../db');
const config = require('../config');

const leagueId = parseInt(process.argv[2] || config.fpl.leagueId, 10);

if (!leagueId || isNaN(leagueId)) {
  console.error('ERROR: No valid league ID provided. Pass as argument or set FPL_LEAGUE_ID in .env');
  process.exit(1);
}

const run = async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`CLEAR FPL DATA — league_id: ${leagueId}`);
  console.log('='.repeat(50));
  console.log('Global tables (players, teams, gameweeks, stats) are NOT touched.\n');

  const steps = [
    {
      label: 'manager_picks',
      sql: `DELETE FROM manager_picks
            WHERE manager_id IN (
              SELECT manager_id FROM managers WHERE league_id = $1
            )`,
    },
    {
      label: 'draft_picks',
      sql: 'DELETE FROM draft_picks WHERE league_id = $1',
    },
    {
      label: 'transactions',
      sql: 'DELETE FROM transactions WHERE league_id = $1',
    },
    {
      label: 'standings',
      sql: 'DELETE FROM standings WHERE league_id = $1',
    },
    {
      label: 'matches',
      sql: 'DELETE FROM matches WHERE league_id = $1',
    },
    {
      label: 'managers',
      sql: 'DELETE FROM managers WHERE league_id = $1',
    },
    {
      label: 'leagues',
      sql: 'DELETE FROM leagues WHERE league_id = $1',
    },
  ];

  let totalDeleted = 0;

  for (const step of steps) {
    const result = await db.query(step.sql, [leagueId]);
    const count = result.rowCount;
    totalDeleted += count;
    console.log(`  ✓ ${step.label}: ${count} row${count !== 1 ? 's' : ''} deleted`);
  }

  console.log(`\nDone. ${totalDeleted} total rows removed for league ${leagueId}.`);
  console.log('Run `node server/jobs/one-time-load.js` to reseed.\n');
  console.log('='.repeat(50));
};

run()
  .catch((err) => {
    console.error('\nFATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => {
    db.pool.end().catch(() => {});
  });
