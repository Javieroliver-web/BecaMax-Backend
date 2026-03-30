const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

// Ruta para eliminar usuario definitivamente
router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
