const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/player-controller');

router.get('/search', ctrl.searchPlayers);
router.get('/:playerId', ctrl.getPlayerById);

module.exports = router;
