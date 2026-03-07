require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const db = require('./db');
const errorHandler = require('./middleware/error-handler');

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled — inline scripts in HTML
app.use(express.json());
app.use(cors({
  origin: config.cors.origin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Static files (Ceefax UI)
app.use(express.static(path.join(__dirname, '../client')));

// Health check — used by Render to verify the service is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// Public config endpoint — lets client JS read leagueId without hardcoding it
app.get('/api/config', (req, res) => {
  res.json({
    leagueId: config.fpl.leagueId,
  });
});

// API routes
app.use('/api/fpl', require('./routes/fpl'));
app.use('/api/league', require('./routes/league'));
app.use('/api/player', require('./routes/player'));
app.use('/api/fixtures', require('./routes/fixtures'));

// SPA fallback — serve index.html for non-file paths
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Error handler (must be last)
app.use(errorHandler);

// Start server only when run directly (not when imported by tests)
let server;
if (require.main === module) {
  server = app.listen(config.port, async () => {
    // Verify DB connection on startup
    try {
      await db.query('SELECT 1');
      console.log(`[server] Running on port ${config.port} (${config.isDev ? 'dev' : 'production'})`);
      const dbLabel = process.env.DATABASE_URL ? 'DATABASE_URL' : `${config.db.database}@${config.db.host}`;
      console.log(`[server] DB: ${dbLabel}`);
    } catch (err) {
      console.error('[server] DB connection failed:', err.message);
      process.exit(1);
    }
  });

  // Start cron jobs inside this process in production (no separate Background Worker needed)
  if (!config.isDev) {
    require('./jobs/cron');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[server] Shutting down...');
    server.close(async () => {
      await db.pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { app, server };
