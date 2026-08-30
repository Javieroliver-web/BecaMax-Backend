const express = require('express');
const router = express.Router();
const { syncBdnsCron } = require('../controllers/bdns.controller');

// GET: invocado automáticamente por Vercel Cron
// POST: invocación manual con Authorization Bearer <CRON_SECRET>
router.get('/process_cron', syncBdnsCron);
router.post('/process_cron', syncBdnsCron);

module.exports = router;
