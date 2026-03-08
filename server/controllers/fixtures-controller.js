const fixturesService = require('../services/fixtures-service');

/**
 * Proxy for football fixtures API.
 * Accepts: ?league=39&date=2026-02-26
 */
const getFixtures = async (req, res, next) => {
  try {
    const { league, date, season, id } = req.query;
    if (!league && !id) return res.status(400).json({ message: 'league or id parameter required' });

    const data = await fixturesService.getFixtures({ league, date, season, id });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

/**
 * Check which leagues have fixtures today.
 * Accepts: ?leagues=39,40,41,42
 * Returns: { "39": true, "40": false, ... }
 *
 * Season is auto-calculated server-side (August onwards = current year,
 * Jan–July = previous year), matching the logic in client/league.js.
 */
const getTodayFixtureStatus = async (req, res, next) => {
  try {
    const { leagues } = req.query;
    if (!leagues) return res.status(400).json({ message: 'leagues parameter required' });

    const leagueIds = leagues.split(',').map(Number).filter(Boolean);

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const year = now.getFullYear();
    const season = (now.getMonth() >= 7 ? year : year - 1).toString();

    const results = {};
    await Promise.all(
      leagueIds.map(async (id) => {
        try {
          const data = await fixturesService.getFixtures({ league: id, date, season });
          results[id] = (data.results || 0) > 0;
        } catch {
          results[id] = false; // fail gracefully — one bad league doesn't break the page
        }
      })
    );

    res.json(results);
  } catch (err) {
    next(err);
  }
};

module.exports = { getFixtures, getTodayFixtureStatus };
