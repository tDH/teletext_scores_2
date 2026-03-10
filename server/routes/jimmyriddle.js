const router = require('express').Router();
const jimmyriddleController = require('../controllers/jimmyriddle-controller');

router.post('/generate', jimmyriddleController.generate);

module.exports = router;
