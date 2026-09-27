const express = require('express');
const router = express.Router();
const { difusionCron } = require('../controllers/difusion.controller');

// GET: invocado automáticamente por Vercel Cron
// POST: invocación manual con Authorization Bearer <CRON_SECRET>
router.get('/process_cron', difusionCron);
router.post('/process_cron', difusionCron);

module.exports = router;
