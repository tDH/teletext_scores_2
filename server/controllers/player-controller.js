const playerService = require('../services/player-service');

const getPlayerById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.playerId);
    if (!id) return res.status(400).json({ message: 'Valid player ID required' });

    const player = await playerService.getPlayerById(id);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    res.json(player);
  } catch (err) {
    next(err);
  }
};

const searchPlayers = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 3) {
      return res.status(400).json({ message: 'Search query must be at least 3 characters' });
    }
    res.json(await playerService.searchPlayers(query));
  } catch (err) {
    next(err);
  }
};

module.exports = { getPlayerById, searchPlayers };
