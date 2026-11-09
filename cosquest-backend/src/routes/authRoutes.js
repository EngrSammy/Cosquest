const express = require('express');
const { signup, login, logout, forgotPassword, resetPassword } = require('../controllers/authController');
const { startGoogle, startApple, googleCallback, appleCallback, exchange } = require('../controllers/oauthController');
const { signupLimiter, loginLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.post('/signup', signupLimiter, asyncHandler(signup));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/logout', requireAuth, asyncHandler(logout));
router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(forgotPassword));
router.post('/reset-password', asyncHandler(resetPassword));
router.get('/oauth/google', startGoogle);
router.get('/oauth/google/callback', asyncHandler(googleCallback));
router.get('/oauth/apple', startApple);
router.post('/oauth/apple/callback', asyncHandler(appleCallback));
router.post('/oauth/exchange', asyncHandler(exchange));

module.exports = router;
