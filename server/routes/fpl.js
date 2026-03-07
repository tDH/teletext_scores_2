const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fpl-controller');

const adminOnly = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // no token configured → open (dev mode)
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

router.get('/game', ctrl.getGameStatus);
router.get('/bootstrap-static', ctrl.getBootstrapStatic);
router.post('/sync-players', adminOnly, ctrl.syncAllPlayers);
router.get('/gameweek/:gameweek', ctrl.getGameweekStats);
router.post('/gameweek/:gameweek/sync', adminOnly, ctrl.syncGameweekStats);
router.post('/cache/clear', adminOnly, ctrl.refreshCache);

module.exports = router;
