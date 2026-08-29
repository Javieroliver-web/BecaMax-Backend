const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alerts.controller');

// GET: invocado automáticamente por Vercel Cron (7:00 AM UTC todos los días)
// POST: invocación manual con Authorization Bearer <CRON_SECRET>
router.get('/process_cron', alertsController.sendAlertsCron);
router.post('/process_cron', alertsController.sendAlertsCron);

module.exports = router;

