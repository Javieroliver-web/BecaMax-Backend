const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { attachUser, requireAuth } = require('../middleware/cookieAuth');

router.use(attachUser);

router.post('/register', authController.register);
router.post('/resend', authController.resendConfirmation);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/logout', authController.logout);
router.get('/session', authController.getSession);
router.post('/update-user', requireAuth, authController.updateUser);

module.exports = router;
