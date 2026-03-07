const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/league-controller');

const adminOnly = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // no token configured → open (dev mode)
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

router.get('/:leagueId', ctrl.getLeagueDetails);
router.post('/:leagueId/sync', adminOnly, ctrl.syncLeagueDetails);
router.get('/:leagueId/db', ctrl.getLeagueDetailsFromDb);
router.get('/:leagueId/transactions', ctrl.getLeagueTransactions);
router.get('/:leagueId/draft-picks', ctrl.getDraftPicks);
router.get('/manager/:managerId/gameweek/:gameweek/team', ctrl.getManagerTeam);

module.exports = router;
