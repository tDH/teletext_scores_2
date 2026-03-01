const fplApi = require('../api/fpl-client');
const playerService = require('../services/player-service');

const getGameStatus = async (req, res, next) => {
  try {
    res.json(await fplApi.getGameStatus());
  } catch (err) {
    next(err);
  }
};

const getBootstrapStatic = async (req, res, next) => {
  try {
    res.json(await fplApi.getBootstrapStatic());
  } catch (err) {
    next(err);
  }
};

const syncAllPlayers = async (req, res, next) => {
  try {
    res.json(await playerService.saveAllPlayers());
  } catch (err) {
    next(err);
  }
};

const getGameweekStats = async (req, res, next) => {
  try {
    const gw = parseInt(req.params.gameweek);
    if (!gw) return res.status(400).json({ message: 'Valid gameweek required' });
    res.json(await fplApi.getLiveGameweekData(gw));
  } catch (err) {
    next(err);
  }
};

const syncGameweekStats = async (req, res, next) => {
  try {
    const gw = parseInt(req.params.gameweek);
    if (!gw) return res.status(400).json({ message: 'Valid gameweek required' });
    res.json(await playerService.savePlayerGameweekStats(gw));
  } catch (err) {
    next(err);
  }
};

const refreshCache = async (req, res, next) => {
  try {
    fplApi.clearCache(req.query.key || undefined);
    res.json({ success: true, message: 'Cache cleared' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getGameStatus,
  getBootstrapStatic,
  syncAllPlayers,
  getGameweekStats,
  syncGameweekStats,
  refreshCache,
};
