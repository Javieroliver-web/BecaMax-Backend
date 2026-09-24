const express = require('express');
const router = express.Router();
const { requireFetchHeader } = require('../middleware/requireFetchHeader');
const { registrar } = require('../controllers/consentimiento.controller');

// Sin sesión a propósito: el banner sale antes de que nadie inicie sesión.
// requireFetchHeader: que un <form> de otra web no pueda registrar elecciones.
router.post('/', requireFetchHeader, registrar);

module.exports = router;
