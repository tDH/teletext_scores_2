/**
 * Job runner utilities.
 * Shared helpers for all job scripts — logging, timing, exit handling.
 */

/**
 * Run a job function with consistent logging and process exit.
 * Used by standalone scripts (one-time-load.js, weekly-complete.js, etc.).
 *
 * @param {string} name - job name for logging
 * @param {Function} fn - async function that returns { success, steps, ... }
 * @param {object} [db] - optional db module to close pool on exit
 */
const runJob = async (name, fn, db) => {
  const start = Date.now();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`JOB: ${name}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  try {
    const result = await fn();

    if (result.skipped) {
      console.log(`\nSKIPPED: ${result.reason}`);
    } else {
      for (const step of result.steps || []) {
        const icon = step.status === 'ok' ? '✓' : '✗';
        console.log(`  ${icon} ${step.name}: ${step.message} (${step.duration}ms)`);
      }

      const duration = Date.now() - start;
      const status = result.success ? 'COMPLETE' : 'COMPLETE WITH ERRORS';
      console.log(`\n${status} (${duration}ms)`);
    }

    return result;
  } catch (err) {
    console.error(`\nFATAL ERROR: ${err.message}`);
    console.error(err.stack);
    throw err;
  } finally {
    if (db) {
      await db.pool.end().catch(() => {});
    }
    console.log('='.repeat(50));
  }
};

module.exports = { runJob };
