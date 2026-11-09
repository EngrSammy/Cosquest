const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const PasswordReset = require('../models/PasswordReset');
const { signToken, generateSessionId } = require('../utils/token');
const { revokeSession } = require('../realtime/socket');
const { sendEmail } = require('../utils/mailer');
const { isValidEmail, isValidUsername, passwordError } = require('../utils/validation');

const WELCOME_MESSAGE =
  "🎉 Welcome to CosQuest! 🥷✨ Your account is officially live. This is your new home for everything you love — real-world quests, your faction, your people, all in one place. 🗺️💜 So glad you're here — let's go make some legendary memories. 🏆";

const RESET_CODE_TTL_MS = 5 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function hashResetCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Issues this account's reset code, replacing any code already outstanding
 * for it (upsert on `user`, which is unique - see PasswordReset.js) so only
 * one code is ever valid per account. The retry loop is what makes two
 * simultaneous forgot-password requests, from two different accounts, safe:
 * if the random code this generates collides with another account's
 * currently-active code, the `codeHash` unique index rejects the write with
 * E11000 and this just draws a new code and tries again - so no two accounts
 * can ever hold the same active code at the same time, race or not.
 */
async function issueResetCode(userId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSixDigitCode();
    try {
      await PasswordReset.findOneAndUpdate(
        { user: userId },
        { $set: { codeHash: hashResetCode(code), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS), attempts: 0 } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return code;
    } catch (error) {
      if (error?.code === 11000) continue; // codeHash or user collision - draw again
      throw error;
    }
  }
  throw new Error('Could not generate a unique password reset code. Please try again.');
}

function resetCodeEmail(code) {
  return {
    subject: 'Your CosQuest password reset code',
    text: `Your CosQuest password reset code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your CosQuest password reset code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>`,
  };
}

/**
 * Signup starts a session immediately. Save its token and use it throughout
 * onboarding; the same token unlocks the app when onboarding is complete.
 * Feature routes still requireCompletedOnboarding. OAuth has its own controller.
 */

async function signup(req, res) {
  const { email, username, identifier, password, confirmPassword } = req.body;

  const signUpIdentifier = identifier || email || username;

  if (!signUpIdentifier || !password || confirmPassword === undefined) {
    return res.status(400).json({
      error: 'email or username, password, and confirmPassword are required.',
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      error: 'password and confirmPassword must match.',
    });
  }

  if (!isValidEmail(signUpIdentifier) && !isValidUsername(signUpIdentifier)) {
    return res.status(400).json({
      error:
        'Provide a valid email address or a username with 3-20 letters, numbers, or underscores.',
    });
  }

  const invalidPassword = passwordError(password);

  if (invalidPassword) {
    return res.status(400).json({
      error: invalidPassword,
    });
  }

  const registeringWithEmail = isValidEmail(signUpIdentifier);

  const existing = registeringWithEmail
    ? await userModel.findByEmail(signUpIdentifier)
    : await userModel.findByUsername(signUpIdentifier);

  /*
   * Existing account that has not completed onboarding.
   * Allow the user to continue onboarding and authenticate them.
   */
  if (existing) {
    if (existing.onboardingComplete) {
      return res.status(409).json({
        error: registeringWithEmail
          ? 'An account with this email already exists.'
          : 'That username is already taken.',
      });
    }

    // Resuming issues a session, so require the existing account's password.
    if (!existing.passwordHash || !(await bcrypt.compare(password, existing.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }
    const updated = existing;

    const sessionId = generateSessionId();
    updated.currentSessionId = sessionId;
    await updated.save();
    revokeSession(updated.id);
    const token = signToken(updated.id, updated.tokenVersion, sessionId);

    return res.status(200).json({
      message:
        'Welcome back - this account already exists but onboarding is not finished yet. Continuing where you left off.',
      resumed: true,
      token,
      onboardingRequired: true,
      user: userModel.sanitize(updated),
    });
  }

  /*
   * Create a completely new account.
   */
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await userModel.createUser({
    email: registeringWithEmail ? signUpIdentifier : undefined,
    username: registeringWithEmail ? undefined : signUpIdentifier,
    passwordHash,
  });

  await notificationModel.createForUser(user._id, WELCOME_MESSAGE);

  const sessionId = generateSessionId();
  user.currentSessionId = sessionId;
  await user.save();
  const token = signToken(user.id, user.tokenVersion, sessionId);

  return res.status(201).json({
    message: 'Account created. Continue onboarding.',
    resumed: false,
    token,
    onboardingRequired: true,
    user: userModel.sanitize(user),
  });
}

async function login(req, res) {
  const { email, username, identifier, password } = req.body;
  const signInIdentifier = identifier || email || username;

  if (!signInIdentifier || !password) {
    return res.status(400).json({ error: 'email or username, and password, are required.' });
  }

  const user = isValidEmail(signInIdentifier)
    ? await userModel.findByEmail(signInIdentifier)
    : await userModel.findByUsername(signInIdentifier);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: 'This account uses social sign-in. Continue with its original provider.' });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Matches the OAuth exchange's shape (see oauthController.js): a valid
  // password always signs a person in, even mid-onboarding, so they can
  // pick up where they left off with a real token instead of being locked
  // out until they finish. `requireCompletedOnboarding` still protects every
  // real feature - this token only additionally lets them resume onboarding
  // via Bearer instead of email, and log out.
  //
  // Rotating the session here is what enforces single-device sign-in: it
  // invalidates whatever token was issued to any other device the moment
  // this login succeeds (see requireAuth's sessionId check).
  const sessionId = generateSessionId();
  user.currentSessionId = sessionId;
  await user.save();
  revokeSession(user.id);
  const token = signToken(user.id, user.tokenVersion, sessionId);
  return res.json({
    message: user.onboardingComplete ? 'Logged in successfully.' : 'Signed in. Complete onboarding to continue.',
    token,
    onboardingRequired: !user.onboardingComplete,
    user: userModel.sanitize(user),
  });
}

/**
 * POST /api/auth/logout (protected - requires the token being logged out)
 * Stateless JWTs can't be "deleted" server-side, so logout works by bumping
 * tokenVersion: any token already issued (including the one used to call
 * this endpoint) stops passing requireAuth's tokenVersion check immediately.
 * This logs out every device/session at once - there's no per-device
 * session tracking in this build, only a single bearer token per user.
 */
async function logout(req, res) {
  const updated = await userModel.updateUser(req.userId, (user) => {
    user.tokenVersion += 1;
  });
  return res.json({ message: 'Logged out successfully.', user: userModel.sanitize(updated) });
}

/**
 * POST /api/auth/forgot-password (public; rate-limited to 30/account/day - see
 * forgotPasswordLimiter in rateLimiter.js)
 * Always the same response whether or not the identifier matches a real
 * account, so this can't be used to check which emails/usernames exist
 * (account enumeration). A username-only account has no email to send a
 * code to, so it silently gets no code either - same generic response either way.
 */
async function forgotPassword(req, res) {
  const { email, username, identifier } = req.body;
  const lookupIdentifier = identifier || email || username;
  if (!lookupIdentifier) {
    return res.status(400).json({ error: 'email or username is required.' });
  }

  const user = isValidEmail(lookupIdentifier)
    ? await userModel.findByEmail(lookupIdentifier)
    : await userModel.findByUsername(lookupIdentifier);

  if (user?.email) {
    const code = await issueResetCode(user._id);
    await sendEmail({ to: user.email, ...resetCodeEmail(code) });
  }

  return res.json({ message: 'If an account with an email on file matches, a reset code has been sent.' });
}

/**
 * POST /api/auth/reset-password (public)
 * Sets a new password from a valid, unexpired code and signs the caller in
 * immediately (they had no session to begin with - that's the point of
 * "forgot password"), rotating the session the same way login/changePassword
 * already do, which signs out any other device holding an older token.
 */
async function resetPassword(req, res) {
  const { email, username, identifier, code, newPassword, confirmPassword } = req.body;
  const lookupIdentifier = identifier || email || username;
  const invalidNewPassword = passwordError(newPassword);
  const invalidCredentialsError = { error: 'That code is invalid or has expired.' };

  if (!lookupIdentifier || typeof code !== 'string' || !code || !newPassword || confirmPassword === undefined) {
    return res.status(400).json({ error: 'identifier, code, newPassword, and confirmPassword are required.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'newPassword and confirmPassword must match.' });
  }
  if (invalidNewPassword) {
    return res.status(400).json({ error: invalidNewPassword });
  }

  const user = isValidEmail(lookupIdentifier)
    ? await userModel.findByEmail(lookupIdentifier)
    : await userModel.findByUsername(lookupIdentifier);
  if (!user) return res.status(400).json(invalidCredentialsError);

  const record = await PasswordReset.findOne({ user: user._id });
  if (!record || record.expiresAt < new Date()) return res.status(400).json(invalidCredentialsError);
  if (record.attempts >= MAX_RESET_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }

  const suppliedHash = hashResetCode(code.trim());
  const suppliedBuffer = Buffer.from(suppliedHash);
  const storedBuffer = Buffer.from(record.codeHash);
  const isMatch = suppliedBuffer.length === storedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, storedBuffer);
  if (!isMatch) {
    record.attempts += 1;
    await record.save();
    return res.status(400).json(invalidCredentialsError);
  }

  await PasswordReset.deleteOne({ _id: record._id });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const sessionId = generateSessionId();
  user.passwordHash = passwordHash;
  user.tokenVersion += 1;
  user.currentSessionId = sessionId;
  await user.save();
  revokeSession(user.id);
  const token = signToken(user.id, user.tokenVersion, sessionId);

  return res.json({ message: 'Password reset. You are now signed in.', token, user: userModel.sanitize(user) });
}

module.exports = { signup, login, logout, forgotPassword, resetPassword };
