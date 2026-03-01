/**
 * Health check job.
 * Verifies DB connectivity and FPL API reachability.
 * Run standalone: npm run health-check
 */

const db = require('../db');
const fplClient = require('../api/fpl-client');
const { runJob } = require('./runner');

runJob('Health Check', async () => {
  const steps = [];

  // 1. Database connectivity
  try {
    await db.query('SELECT 1');
    steps.push({ name: 'Database', status: 'ok', message: 'Connected', duration: 0 });
  } catch (err) {
    steps.push({ name: 'Database', status: 'error', message: err.message, duration: 0 });
  }

  // 2. FPL API reachability
  try {
    await fplClient.getBootstrapData();
    steps.push({ name: 'FPL API', status: 'ok', message: 'Reachable', duration: 0 });
  } catch (err) {
    steps.push({ name: 'FPL API', status: 'error', message: err.message, duration: 0 });
  }

  const success = steps.every(s => s.status === 'ok');
  return { success, steps };
}, db);
