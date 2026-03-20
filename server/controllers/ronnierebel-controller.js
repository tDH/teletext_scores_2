const rrService = require('../services/ronnierebel-service');

const generate = async (req, res, next) => {
  try {
    const questions = await rrService.generateQuestions();
    res.json({ questions });
  } catch (err) {
    if (err.message === 'ANTHROPIC_API_KEY is not configured') {
      return res.status(503).json({ error: 'RonnieRebel service is not available' });
    }
    next(err);
  }
};

const saveResult = async (req, res, next) => {
  try {
    const { playerName, correctAnswers, totalTimeMs } = req.body;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'playerName is required' });
    }
    if (typeof correctAnswers !== 'number' || correctAnswers < 0 || correctAnswers > 5) {
      return res.status(400).json({ error: 'correctAnswers must be 0-5' });
    }
    if (typeof totalTimeMs !== 'number' || totalTimeMs < 0) {
      return res.status(400).json({ error: 'totalTimeMs must be a non-negative number' });
    }

    const result = await rrService.saveResult({
      playerName: playerName.trim().substring(0, 3).toUpperCase(),
      correctAnswers,
      totalTimeMs,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getLeaderboard = async (req, res, next) => {
  try {
    const rows = await rrService.getLeaderboard();
    res.json({ leaderboard: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { generate, saveResult, getLeaderboard };
