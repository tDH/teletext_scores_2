const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/league-controller');

router.get('/:leagueId', ctrl.getLeagueDetails);
router.post('/:leagueId/sync', ctrl.syncLeagueDetails);
router.get('/:leagueId/db', ctrl.getLeagueDetailsFromDb);
router.get('/:leagueId/transactions', ctrl.getLeagueTransactions);
router.get('/:leagueId/draft-picks', ctrl.getDraftPicks);
router.get('/manager/:managerId/gameweek/:gameweek/team', ctrl.getManagerTeam);

module.exports = router;
