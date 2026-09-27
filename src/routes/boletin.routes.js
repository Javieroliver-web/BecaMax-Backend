const express = require('express');
const router = express.Router();
const { requireFetchHeader } = require('../middleware/requireFetchHeader');
const { boletinLimiter } = require('../middleware/rateLimiter');
const { alta, confirmarEnlace, baja, envioSemanalCron } = require('../controllers/boletin.controller');

// Alta: sin sesión (cualquiera puede suscribirse), con límite propio por IP
// y la cabecera propia para que un <form> de otra web no pueda usarla.
router.post('/alta', boletinLimiter, requireFetchHeader, alta);

// Enlaces de los correos: tienen que funcionar con un clic, sin cabeceras.
router.get('/confirmar', boletinLimiter, confirmarEnlace);
router.get('/baja', baja);
// POST sin requireFetchHeader a propósito: lo manda el cliente de correo
// (List-Unsubscribe-Post, RFC 8058). Solo borra la fila del token que trae.
router.post('/baja', express.urlencoded({ extended: false, limit: '2kb' }), baja);

router.get('/process_cron', envioSemanalCron);
router.post('/process_cron', envioSemanalCron);

module.exports = router;
