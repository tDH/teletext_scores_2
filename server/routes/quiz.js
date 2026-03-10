const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quiz-controller');

router.post('/generate', quizController.generate);
router.post('/result', quizController.saveResult);
router.get('/leaderboard', quizController.getLeaderboard);

module.exports = router;
