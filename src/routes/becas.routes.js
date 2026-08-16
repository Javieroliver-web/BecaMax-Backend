const express = require('express');
const router = express.Router();
const { getBecas, getBecaById } = require('../controllers/becas.controller');

// GET /api/becas                — Todas las becas con filtros, orden y paginación
router.get('/', getBecas);

// GET /api/becas/:id            — Detalle de una beca
router.get('/:id', getBecaById);

module.exports = router;
