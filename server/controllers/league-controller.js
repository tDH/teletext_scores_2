const leagueService = require('../services/league-service');
const playerService = require('../services/player-service');
const fplApi = require('../api/fpl-client');

const getLeagueDetails = async (req, res, next) => {
  try {
    const id = parseInt(req.params.leagueId);
    if (!id) return res.status(400).json({ message: 'Valid league ID required' });
    res.json(await fplApi.getLeagueDetails(id));
  } catch (err) {
    next(err);
  }
};

const syncLeagueDetails = async (req, res, next) => {
  try {
    const id = parseInt(req.params.leagueId);
    if (!id) return res.status(400).json({ message: 'Valid league ID required' });
    res.json(await leagueService.saveLeagueDetails(id));
  } catch (err) {
    next(err);
  }
};

const getLeagueDetailsFromDb = async (req, res, next) => {
  try {
    const id = parseInt(req.params.leagueId);
    if (!id) return res.status(400).json({ message: 'Valid league ID required' });

    const data = await leagueService.getLeagueDetailsFromDb(id);
    if (!data) return res.status(404).json({ message: 'League not found in database' });

    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getLeagueTransactions = async (req, res, next) => {
  try {
    const id = parseInt(req.params.leagueId);
    if (!id) return res.status(400).json({ message: 'Valid league ID required' });
    res.json(await leagueService.getTransactionsFromDb(id));
  } catch (err) {
    next(err);
  }
};

const getDraftPicks = async (req, res, next) => {
  try {
    const id = parseInt(req.params.leagueId);
    if (!id) return res.status(400).json({ message: 'Valid league ID required' });
    res.json(await fplApi.getDraftPicks(id));
  } catch (err) {
    next(err);
  }
};

const getManagerTeam = async (req, res, next) => {
  try {
    const managerId = parseInt(req.params.managerId);
    const gameweek = parseInt(req.params.gameweek);
    if (!managerId) return res.status(400).json({ message: 'Valid manager ID required' });
    if (!gameweek) return res.status(400).json({ message: 'Valid gameweek required' });
    res.json(await playerService.getManagerTeam(managerId, gameweek));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getLeagueDetails,
  syncLeagueDetails,
  getLeagueDetailsFromDb,
  getLeagueTransactions,
  getDraftPicks,
  getManagerTeam,
};
