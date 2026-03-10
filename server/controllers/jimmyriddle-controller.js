const jimmyriddleService = require('../services/jimmyriddle-service');

const generate = async (req, res, next) => {
  try {
    const player = await jimmyriddleService.generatePlayer();
    res.json({ player });
  } catch (err) {
    if (err.message === 'ANTHROPIC_API_KEY is not configured') {
      return res.status(503).json({ error: 'Jimmyriddle service is not available' });
    }
    next(err);
  }
};

module.exports = { generate };
