const express = require('express');
const router = express.Router();
const { attachUser } = require('../middleware/cookieAuth');
const { requireFetchHeader } = require('../middleware/requireFetchHeader');
const { proxyDb } = require('../controllers/dbProxy.controller');

// Sin requireAuth a proposito: hay operaciones legitimas sin sesion (ej.
// insertar una incidencia como usuario anonimo). RLS decide, no este proxy.
router.use(attachUser);
router.use(requireFetchHeader);
router.all('/*splat', proxyDb);

module.exports = router;
