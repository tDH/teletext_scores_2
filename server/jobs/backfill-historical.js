/**
 * Backfill historical gameweek data.
 *
 * The `matches` table is fully populated by one-time-load.js, so match
 * scores for all past GWs are correct. However, `manager_picks` and
 * `player_gameweek_stats` are only written by the weekly sync jobs, meaning
 * gameweeks that completed before the app was deployed have no pick/stat data
 * — causing the matchup detail page (P308) to show "NO PICKS YET".
 *
 * This script iterates every finished gameweek stored in the matches table
 * and backfills both tables using the existing service functions.
 *
 * Usage:
 *   node server/jobs/backfill-historical.js
 *
 * Safe to re-run — savePlayerGameweekStats uses ON CONFLICT DO UPDATE,
 * and saveManagerPicks deletes then re-inserts per manager+GW.
 */
require('dotenv').config();
const config = require('../config');
const db = require('../db');
const playerService = require('../services/player-service');

const leagueId = config.fpl.leagueId;

const pad = (n) => String(n).padStart(2, '0');
const ts = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (msg) => console.log(`[${ts()}] ${msg}`);

async function run() {
  console.log('\n' + '='.repeat(50));
  console.log('BACKFILL: Historical Gameweek Data');
  console.log(`League: ${leagueId}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  // 1. Get all finished GWs from the matches table
  const gwResult = await db.query(
    `SELECT DISTINCT event AS gw
     FROM matches
     WHERE league_id = $1 AND finished = true
     ORDER BY gw`,
    [leagueId]
  );

  if (gwResult.rows.length === 0) {
    log('No finished gameweeks found in matches table — nothing to backfill.');
    return;
  }

  const finishedGws = gwResult.rows.map((r) => r.gw);
  log(`Found ${finishedGws.length} finished GW(s): ${finishedGws.join(', ')}`);

  // 2. Get all managers for this league
  const managerResult = await db.query(
    'SELECT manager_id FROM managers WHERE league_id = $1 ORDER BY manager_id',
    [leagueId]
  );

  if (managerResult.rows.length === 0) {
    log('No managers found for this league — run load:one-time first.');
    return;
  }

  const managerIds = managerResult.rows.map((r) => r.manager_id);
  log(`Found ${managerIds.length} manager(s)`);

  let totalStatsOk = 0, totalStatsErr = 0;
  let totalPicksOk = 0, totalPicksErr = 0;

  // 3. For each GW: save player stats, then save picks for each manager
  for (const gw of finishedGws) {
    log(`\n--- GW ${gw} ---`);

    // Player stats (one call per GW, covers all players)
    try {
      await playerService.savePlayerGameweekStats(gw);
      log(`  ✓ Player stats saved (GW ${gw})`);
      totalStatsOk++;
    } catch (err) {
      log(`  ✗ Player stats FAILED (GW ${gw}): ${err.message}`);
      totalStatsErr++;
      // Continue — picks may still succeed if stats already existed
    }

    // Manager picks (one call per manager per GW)
    for (const managerId of managerIds) {
      try {
        await playerService.saveManagerPicks(managerId, gw);
        log(`  ✓ Picks saved — manager ${managerId} GW ${gw}`);
        totalPicksOk++;
      } catch (err) {
        log(`  ✗ Picks FAILED — manager ${managerId} GW ${gw}: ${err.message}`);
        totalPicksErr++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  log(`Stats: ${totalStatsOk} ok, ${totalStatsErr} failed`);
  log(`Picks: ${totalPicksOk} ok, ${totalPicksErr} failed`);
  console.log('='.repeat(50));
}

run()
  .catch((err) => {
    console.error('\nFATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => {
    db.pool.end().catch(() => {});
  });
