const express = require('express');
const router = express.Router();
const { getFavorites, addFavorite, removeFavorite } = require('../controllers/favorites.controller');

router.get('/',           getFavorites);
router.post('/',          addFavorite);
router.delete('/:beca_id', removeFavorite);

module.exports = router;
