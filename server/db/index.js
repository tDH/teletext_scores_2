const { Pool } = require('pg');

// Config is loaded by the caller before requiring this module.
// We read from process.env directly here so this file can also be used
// by test helpers that point at a different database.
const createPool = (overrides = {}) => {
  return new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    ...overrides,
  });
};

const pool = createPool();

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Execute a parameterised query.
 * Logs query info in development only.
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (isDev) {
      const duration = Date.now() - start;
      // Truncate long queries in logs to keep output readable
      console.log('query', {
        text: text.length > 100 ? text.substring(0, 100) + '...' : text,
        duration,
        rows: res.rowCount,
      });
    }
    return res;
  } catch (error) {
    console.error('Query error', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
};

module.exports = {
  query,
  pool,
  createPool,
};
