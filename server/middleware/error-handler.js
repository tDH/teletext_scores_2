/**
 * Central error handler middleware.
 * Logs errors in development, returns consistent JSON in all environments.
 */
const config = require('../config');

const errorHandler = (err, req, res, next) => {
  if (config.isDev) {
    console.error(err.stack);
  } else {
    console.error(`[error] ${req.method} ${req.path}: ${err.message}`);
  }

  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    status,
  });
};

module.exports = errorHandler;
