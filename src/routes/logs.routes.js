const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logs.controller');
const { visitasLimiter } = require('../middleware/rateLimiter');

router.post('/', visitasLimiter, logsController.registrarVisita);

module.exports = router;
