/**
 * Weekly complete load: run after a gameweek finishes.
 * Updates gameweeks, players, matches, standings, transactions, player stats.
 *
 * Usage: node server/jobs/weekly-complete.js [leagueId] [force]
 * - force: bypass the "gameweek must be finished" check
 */
require('dotenv').config();
const config = require('../config');
const syncService = require('../services/sync-service');
const db = require('../db');
const { runJob } = require('./runner');

const args = process.argv.slice(2);
const leagueId = args[0] && !isNaN(parseInt(args[0])) ? parseInt(args[0]) : config.fpl.leagueId;
const force = args.includes('force');

runJob(
  `Weekly Complete (league ${leagueId}${force ? ', FORCED' : ''})`,
  () => syncService.runWeeklyComplete(leagueId, { force }),
  db
).catch(() => process.exit(1));
