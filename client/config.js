/**
 * Client-side config.
 * Fetches public config from /api/config so leagueId is never hardcoded in JS.
 *
 * Usage in other client files:
 *   const { leagueId } = await getConfig();
 */

let _config = null;

const getConfig = async () => {
  if (_config) return _config;
  try {
    const res = await fetch('/api/config');
    _config = await res.json();
  } catch (err) {
    console.error('Failed to load config:', err);
    _config = { leagueId: null };
  }
  return _config;
};

// Convenience export for non-async contexts (call getConfig() first)
const AppConfig = {
  get leagueId() {
    return _config ? _config.leagueId : null;
  },
};

window.AppConfig = AppConfig;
window.getConfig = getConfig;
