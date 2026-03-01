require('dotenv').config();

/**
 * Reads a required environment variable. Throws at startup if missing.
 * This catches misconfiguration immediately rather than at runtime.
 */
const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
};

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  isDev: process.env.NODE_ENV !== 'production',

  cors: {
    origin: required('CORS_ORIGIN'),
  },

  db: {
    user: required('DB_USER'),
    host: required('DB_HOST'),
    database: required('DB_DATABASE'),
    password: required('DB_PASSWORD'),
    port: parseInt(process.env.DB_PORT || '5432', 10),
  },

  testDb: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.TEST_DB_DATABASE || 'teletext_scores_2_test',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432', 10),
  },

  fpl: {
    leagueId: parseInt(required('FPL_LEAGUE_ID'), 10),
    apiBaseUrl: process.env.FPL_API_URL || 'https://draft.premierleague.com/api',
  },

  football: {
    apiKey: required('FOOTBALL_API_KEY'),
    apiHost: 'v3.football.api-sports.io',
  },

  cache: {
    defaultTtl: parseInt(process.env.CACHE_TTL_DEFAULT || '600', 10),
    liveTtl: parseInt(process.env.CACHE_TTL_LIVE || '120', 10),
    managerPicksTtl: 300,
    staticTtl: 3600,
  },
};

module.exports = config;
