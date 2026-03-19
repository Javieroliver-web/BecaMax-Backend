const express = require('express');
const router = express.Router();
const { getBecas } = require('../controllers/becas.controller');

// Obtener becas
router.get('/', getBecas);

module.exports = router;
