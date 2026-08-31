const express = require('express');
const router = express.Router();
const { attachUser, requireAuth } = require('../middleware/cookieAuth');
const { requireFetchHeader } = require('../middleware/requireFetchHeader');
const { proxyStorage } = require('../controllers/storageProxy.controller');

router.use(attachUser);
router.use(requireAuth);
router.use(requireFetchHeader);
// Body binario (imagen ya comprimida en el navegador, ~cientos de KB): se
// vuelca a Buffer para reenviarlo tal cual, no lo toca express.json() porque
// el content-type nunca es application/json.
router.all('/*splat', express.raw({ type: () => true, limit: '8mb' }), proxyStorage);

module.exports = router;
