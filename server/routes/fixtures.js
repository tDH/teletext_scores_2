const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fixtures-controller');

// GET /api/fixtures?league=39&date=2026-02-26
router.get('/', ctrl.getFixtures);

module.exports = router;
