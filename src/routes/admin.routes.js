const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

// Ruta para eliminar usuario definitivamente
router.delete('/users/:id', adminController.deleteUser);

// RUTA PARA PANEL DE NOTICIAS
router.post('/news', adminController.postNews);
router.delete('/news', adminController.deleteNews);

module.exports = router;
