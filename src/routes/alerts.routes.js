const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alerts.controller');

// Endpoint privado invocado por Vercel Cron
router.post('/process_cron', alertsController.sendAlertsCron);

module.exports = router;
