const quizService = require('../services/quiz-service');

const VALID_LEAGUES = ['scotland', 'england'];
const VALID_DECADES = ['1990s', '2000s', '2010s', '2020s'];

const generate = async (req, res, next) => {
  try {
    const { league, decade } = req.body;

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ error: `Invalid league. Must be one of: ${VALID_LEAGUES.join(', ')}` });
    }
    if (!VALID_DECADES.includes(decade)) {
      return res.status(400).json({ error: `Invalid decade. Must be one of: ${VALID_DECADES.join(', ')}` });
    }

    const questions = await quizService.generateQuestions(league, decade);
    res.json({ questions });
  } catch (err) {
    if (err.message === 'ANTHROPIC_API_KEY is not configured') {
      return res.status(503).json({ error: 'Quiz service is not available' });
    }
    next(err);
  }
};

const saveResult = async (req, res, next) => {
  try {
    const { playerName, league, decade, correctAnswers, totalTimeMs } = req.body;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'playerName is required' });
    }
    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ error: 'Invalid league' });
    }
    if (!VALID_DECADES.includes(decade)) {
      return res.status(400).json({ error: 'Invalid decade' });
    }
    if (typeof correctAnswers !== 'number' || correctAnswers < 0 || correctAnswers > 5) {
      return res.status(400).json({ error: 'correctAnswers must be 0-5' });
    }
    if (typeof totalTimeMs !== 'number' || totalTimeMs < 0) {
      return res.status(400).json({ error: 'totalTimeMs must be a non-negative number' });
    }

    const result = await quizService.saveResult({
      playerName: playerName.trim().substring(0, 3).toUpperCase(),
      league,
      decade,
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
    const league = VALID_LEAGUES.includes(req.query.league) ? req.query.league : null;
    const rows = await quizService.getLeaderboard(league);
    res.json({ leaderboard: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { generate, saveResult, getLeaderboard };
