/**
 * Cron job manager.
 *
 * Improvements over original:
 * - Imports sync functions as modules (no child_process.exec)
 *   → errors are caught properly, not swallowed in shell output
 * - leagueId comes from config (not hardcoded)
 * - Graceful shutdown on SIGTERM/SIGINT (closes DB pool cleanly)
 * - Guard prevents overlapping runs of the same job
 *
 * Schedule:
 *   Tuesday 3am     — weekly-complete (after Monday night processing)
 *   Every 15 min    — weekly-start check: fires when a new GW deadline is
 *                     detected (current_event changes in the FPL API), replacing
 *                     the old fixed Friday 3am schedule. Adapts automatically to
 *                     midweek rounds, holiday fixtures, etc.
 *   Every 5 min     — frequent (live stats during match days)
 */
const cron = require('node-cron');
const config = require('../config');
const fplApi = require('../api/fpl-client');
const syncService = require('../services/sync-service');
const db = require('../db');

const leagueId = config.fpl.leagueId;

// Guards to prevent overlapping runs
const running = {
  weeklyComplete: false,
  weeklyStart: false,
  frequent: false,
};

const logStep = (name, step) => {
  const icon = step.status === 'ok' ? '✓' : '✗';
  console.log(`  ${icon} [${name}] ${step.name}: ${step.message}`);
};

// ── Weekly complete — after gameweek finishes (Tuesday 3am) ───────────────────
cron.schedule('0 3 * * 2', async () => {
  if (running.weeklyComplete) {
    console.log('[cron] weekly-complete already running, skipping');
    return;
  }
  running.weeklyComplete = true;
  console.log(`[cron] weekly-complete started (GW complete, league ${leagueId})`);
  try {
    const result = await syncService.runWeeklyComplete(leagueId);
    if (result.skipped) {
      console.log(`[cron] weekly-complete skipped: ${result.reason}`);
    } else {
      (result.steps || []).forEach((s) => logStep('weekly-complete', s));
      console.log(`[cron] weekly-complete finished (success=${result.success})`);
    }
  } catch (err) {
    console.error('[cron] weekly-complete error:', err.message);
  } finally {
    running.weeklyComplete = false;
  }
});

// ── Weekly start — event-driven: fires when a new GW deadline is detected ────
//
// Polls every 15 minutes. On the first poll after server start the current GW
// is recorded as the baseline (no trigger). When current_event subsequently
// increases, weekly-start runs immediately — this is typically seconds after
// the FPL deadline passes, which is 60-90 min before the first kick-off.
//
// This replaces the old fixed Friday 3am schedule and adapts automatically to
// midweek rounds, blank gameweeks, and holiday fixture lists.
let lastWeeklyStartGw = null; // null = not yet initialised

async function checkWeeklyStart() {
  if (running.weeklyStart) return;

  let currentGw;
  try {
    const gameStatus = await fplApi.getGameStatus();
    if (!gameStatus || !gameStatus.current_event) return;
    currentGw = gameStatus.current_event;
  } catch (err) {
    // Transient API error — will retry on next poll
    return;
  }

  // First poll after server start: record baseline, don't trigger
  if (lastWeeklyStartGw === null) {
    lastWeeklyStartGw = currentGw;
    console.log(`[cron] weekly-start baseline set to GW${currentGw}`);
    return;
  }

  // GW unchanged — nothing to do
  if (currentGw === lastWeeklyStartGw) return;

  // New GW detected — run weekly-start
  console.log(`[cron] GW change detected: GW${lastWeeklyStartGw} → GW${currentGw}, running weekly-start`);
  lastWeeklyStartGw = currentGw;

  running.weeklyStart = true;
  try {
    const result = await syncService.runWeeklyStart(leagueId);
    (result.steps || []).forEach((s) => logStep('weekly-start', s));
    console.log(`[cron] weekly-start finished (GW${currentGw}, success=${result.success})`);
  } catch (err) {
    console.error('[cron] weekly-start error:', err.message);
  } finally {
    running.weeklyStart = false;
  }
}

cron.schedule('*/15 * * * *', checkWeeklyStart);

// ── Frequent load — every 5 minutes (live stats) ─────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  if (running.frequent) return; // silent skip — this runs very often
  running.frequent = true;
  try {
    const result = await syncService.runFrequentLoad();
    if (!result.success) {
      (result.steps || [])
        .filter((s) => s.status === 'error')
        .forEach((s) => console.error(`[cron] frequent error: ${s.message}`));
    }
  } catch (err) {
    console.error('[cron] frequent load error:', err.message);
  } finally {
    running.frequent = false;
  }
});

console.log('[cron] Job manager started');
console.log(`[cron] League ID: ${leagueId}`);
console.log('[cron] Schedule: Tuesday 3am (weekly-complete), every 15min GW check (weekly-start), every 5min (frequent)');

// Graceful shutdown — close DB pool cleanly when process is stopped
const shutdown = async () => {
  console.log('[cron] Shutting down...');
  await db.pool.end().catch(() => {});
  process.exit(0);
};

// Only register shutdown handlers when running standalone.
// When imported by server.js, server.js handles SIGTERM gracefully.
if (require.main === module) {
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
