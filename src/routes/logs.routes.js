const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logs.controller');

router.post('/', logsController.registrarVisita);

module.exports = router;
