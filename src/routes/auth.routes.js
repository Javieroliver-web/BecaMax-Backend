const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { attachUser, requireAuth } = require('../middleware/cookieAuth');
const { requireFetchHeader } = require('../middleware/requireFetchHeader');
const { authLimiter } = require('../middleware/rateLimiter');

router.use(attachUser);
router.use(requireFetchHeader);

router.post('/register', authLimiter, authController.register);
router.post('/resend', authLimiter, authController.resendConfirmation);
router.post('/login', authLimiter, authController.login);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
// Login con Google: navegaciones GET de primer nivel (no fetch), por eso no
// les afecta requireFetchHeader, que solo exige la cabecera en escrituras.
router.get('/google', authLimiter, authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.post('/logout', authController.logout);
router.get('/session', authController.getSession);
router.post('/update-user', requireAuth, authController.updateUser);

module.exports = router;
