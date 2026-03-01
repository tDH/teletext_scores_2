/**
 * Weekly start load: run before a new gameweek begins.
 * Syncs manager picks for the current gameweek.
 *
 * Usage: node server/jobs/weekly-start.js [leagueId]
 */
require('dotenv').config();
const config = require('../config');
const syncService = require('../services/sync-service');
const db = require('../db');
const { runJob } = require('./runner');

const args = process.argv.slice(2);
const leagueId = args[0] && !isNaN(parseInt(args[0])) ? parseInt(args[0]) : config.fpl.leagueId;

runJob(
  `Weekly Start (league ${leagueId})`,
  () => syncService.runWeeklyStart(leagueId),
  db
).catch(() => process.exit(1));
