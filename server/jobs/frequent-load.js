/**
 * Frequent load: run every 5 minutes during live matches.
 * Updates latest_player_gameweek_stats with live data.
 *
 * Usage: node server/jobs/frequent-load.js
 * (typically invoked by cron.js, not run standalone)
 */
require('dotenv').config();
const syncService = require('../services/sync-service');
const db = require('../db');
const { runJob } = require('./runner');

runJob(
  'Frequent Load (live stats)',
  () => syncService.runFrequentLoad(),
  db
).catch(() => process.exit(1));
