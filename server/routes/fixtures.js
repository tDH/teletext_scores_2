const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fixtures-controller');

// GET /api/fixtures?league=39&date=2026-02-26
router.get('/', ctrl.getFixtures);

// GET /api/fixtures/today?leagues=39,40,41  — returns { "39": true, "41": false, ... }
router.get('/today', ctrl.getTodayFixtureStatus);

module.exports = router;
