const fixturesService = require('../services/fixtures-service');

/**
 * Proxy for football fixtures API.
 * Accepts: ?league=39&date=2026-02-26
 */
const getFixtures = async (req, res, next) => {
  try {
    const { league, date, season } = req.query;
    if (!league) return res.status(400).json({ message: 'league parameter required' });

    const data = await fixturesService.getFixtures({ league, date, season });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getFixtures };
