const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/scout-controller');

const adminOnly = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// GET /api/scout/gw/:gw/predictions
router.get('/gw/:gw/predictions', ctrl.getPredictions);

// POST /api/scout/gw/:gw/predictions/generate  (admin only — manual trigger / testing)
router.post('/gw/:gw/predictions/generate', adminOnly, ctrl.generatePredictions);

module.exports = router;
