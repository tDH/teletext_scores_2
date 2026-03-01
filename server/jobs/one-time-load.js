/**
 * One-time load: league info, managers, teams, players, draft picks.
 * Run once at the start of a season.
 *
 * Usage: node server/jobs/one-time-load.js [leagueId]
 */
require('dotenv').config();
const config = require('../config');
const syncService = require('../services/sync-service');
const db = require('../db');
const { runJob } = require('./runner');

const args = process.argv.slice(2);
const leagueId = args[0] && !isNaN(parseInt(args[0])) ? parseInt(args[0]) : config.fpl.leagueId;

runJob(
  `One-Time Load (league ${leagueId})`,
  () => syncService.runOneTimeLoad(leagueId),
  db
).catch(() => process.exit(1));
