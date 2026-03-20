const express = require('express');
const router = express.Router();
const rrController = require('../controllers/ronnierebel-controller');

router.post('/generate',   rrController.generate);
router.post('/result',     rrController.saveResult);
router.get('/leaderboard', rrController.getLeaderboard);

module.exports = router;
