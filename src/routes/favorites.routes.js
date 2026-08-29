const express = require('express');
const router = express.Router();
const { requireAuth, getFavorites, addFavorite, removeFavorite } = require('../controllers/favorites.controller');

router.use(requireAuth);

router.get('/',           getFavorites);
router.post('/',          addFavorite);
router.delete('/:beca_id', removeFavorite);

module.exports = router;
