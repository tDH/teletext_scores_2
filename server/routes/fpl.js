const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fpl-controller');

router.get('/game', ctrl.getGameStatus);
router.get('/bootstrap-static', ctrl.getBootstrapStatic);
router.post('/sync-players', ctrl.syncAllPlayers);
router.get('/gameweek/:gameweek', ctrl.getGameweekStats);
router.post('/gameweek/:gameweek/sync', ctrl.syncGameweekStats);
router.post('/cache/clear', ctrl.refreshCache);

module.exports = router;
