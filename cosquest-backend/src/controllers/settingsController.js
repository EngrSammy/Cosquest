const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Block = require('../models/Block');
const SupportRequest = require('../models/SupportRequest');
const userModel = require('../models/userModel');
const { isValidEmail, isValidUsername, normalizeUsername, passwordError } = require('../utils/validation');
const { signToken, generateSessionId } = require('../utils/token');
const { revokeSession } = require('../realtime/socket');

function accountInfo(user) {
  return {
    displayName: user.profile.displayName || [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' '),
    username: user.profile.username, email: user.email || null,
    phone: user.account?.phone || '', dateOfBirth: user.account?.dateOfBirth || null,
    avatarPhotoUrl: user.profile.avatarPhotoUrl, avatarKey: user.profile.avatarKey,
    hasPassword: Boolean(user.passwordHash),
  };
}

function notifications(user) {
  return {
    notificationsEnabled: user.preferences.notificationsEnabled,
    ...user.notificationCategories.toObject(),
    emailWeeklyNewsletter: user.preferences.emailWeeklyNewsletter,
    emailPromotionalEvents: user.preferences.emailPromotionalEvents,
  };
}

async function getSettings(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({
    account: accountInfo(req.user), privacy: req.user.privacy,
    notifications: notifications(req.user), appearance: req.user.appearance, dataUsage: req.user.dataUsage,
    blockedUserCount: await Block.countDocuments({ blocker: req.userId }),
  });
}

function getAccount(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({ account: accountInfo(req.user) });
}

async function updateAccount(req, res) {
  const { displayName, username, email, phone, dateOfBirth, currentPassword } = req.body;
  const patch = {};
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 80) return res.status(400).json({ error: 'displayName must contain 1-80 characters.' });
    patch['profile.displayName'] = displayName.trim();
  }
  if (username !== undefined) {
    if (!isValidUsername(username)) return res.status(400).json({ error: 'username must contain 3-20 letters, numbers, or underscores.' });
    if (await userModel.isUsernameTaken(username, req.userId)) return res.status(409).json({ error: 'That username is already taken.' });
    patch['profile.username'] = username.trim();
    patch['profile.usernameNormalized'] = normalizeUsername(username);
  }
  if (phone !== undefined) {
    if (typeof phone !== 'string') return res.status(400).json({ error: 'phone must be text.' });
    const normalized = phone.replace(/[\s().-]/g, '');
    if (normalized && !/^\+[1-9]\d{6,14}$/.test(normalized)) return res.status(400).json({ error: 'phone must include the country code, e.g. +15552345678, or be empty.' });
    patch['account.phone'] = normalized;
  }
  if (dateOfBirth !== undefined) {
    const date = typeof dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? new Date(`${dateOfBirth}T00:00:00Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth) return res.status(400).json({ error: 'dateOfBirth must be a valid YYYY-MM-DD date.' });
    const today = new Date();
    let age = today.getUTCFullYear() - date.getUTCFullYear();
    if (today.getUTCMonth() < date.getUTCMonth() || (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate())) age--;
    if (age < 13 || age > 120) return res.status(400).json({ error: 'Age must be between 13 and 120.' });
    patch['account.dateOfBirth'] = dateOfBirth;
    patch['profile.age'] = age;
  }
  let emailChanged = false;
  if (email !== undefined) {
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Provide a valid email.' });
    const normalized = email.trim().toLowerCase();
    emailChanged = normalized !== req.user.email;
    if (emailChanged) {
      if (!req.user.passwordHash) return res.status(400).json({ error: 'Email changes for social sign-in accounts require provider reauthentication, which is not available here yet.' });
      if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(401).json({ error: 'Your current password is required to change the login email.' });
      patch.email = normalized;
    }
  }
  if (!Object.keys(patch).length) return res.json({ account: accountInfo(req.user) });
  // Changing the login email already signs out every other session (via the
  // tokenVersion bump below); rotate sessionId too so the token reissued
  // here becomes the one true session, consistent with that.
  const sessionId = emailChanged ? generateSessionId() : null;
  if (emailChanged) patch.currentSessionId = sessionId;
  try {
    const updated = await User.findOneAndUpdate(
      { _id: req.userId, tokenVersion: req.user.tokenVersion },
      { $set: patch, ...(emailChanged ? { $inc: { tokenVersion: 1 } } : {}) },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(401).json({ error: 'Session changed. Please sign in again.' });
    // Distinct reason from a real "signed in elsewhere": the device making
    // this request already has the fresh token in this response and should
    // just reconnect its socket quietly, not show a "logged out" screen.
    if (emailChanged) revokeSession(updated.id, 'email_changed');
    return res.json({ account: accountInfo(updated), ...(emailChanged ? { token: signToken(updated.id, updated.tokenVersion, sessionId) } : {}) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email or username is already taken.' });
    throw error;
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const invalid = passwordError(newPassword);
  if (invalid || newPassword !== confirmPassword) return res.status(400).json({ error: invalid || 'Passwords must match.' });
  if (!req.user.passwordHash || typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, req.user.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect or this account uses social sign-in.' });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const sessionId = generateSessionId();
  const updated = await User.findOneAndUpdate(
    { _id: req.userId, passwordHash: req.user.passwordHash, tokenVersion: req.user.tokenVersion },
    { $set: { passwordHash, currentSessionId: sessionId }, $inc: { tokenVersion: 1 } }, { new: true }
  );
  if (!updated) return res.status(409).json({ error: 'Account changed. Please sign in again.' });
  revokeSession(updated.id, 'password_changed');
  return res.json({ message: 'Password changed. Other sessions have been signed out.', token: signToken(updated.id, updated.tokenVersion, sessionId) });
}

function getNotifications(req, res) { return res.json({ notifications: notifications(req.user) }); }
function getAppearance(req, res) { return res.json({ appearance: req.user.appearance }); }
function getDataUsage(req, res) { return res.json({ dataUsage: req.user.dataUsage, storageManagedBy: 'device' }); }

function updateSection(section, rules) {
  return async (req, res) => {
    const keys = Object.keys(req.body);
    if (!keys.length || keys.some((key) => !rules[key])) return res.status(400).json({ error: `Provide supported fields: ${Object.keys(rules).join(', ')}.` });
    for (const key of keys) {
      if (!rules[key](req.body[key])) return res.status(400).json({ error: `Invalid ${key}.` });
    }
    const patch = Object.fromEntries(keys.map((key) => [`${section}.${key}`, req.body[key]]));
    const user = await User.findByIdAndUpdate(req.userId, { $set: patch }, { new: true, runValidators: true });
    return res.json({ [section]: user[section] });
  };
}
const boolean = (value) => typeof value === 'boolean';
const updateAppearance = updateSection('appearance', {
  themeMode: (v) => ['light', 'dark', 'system'].includes(v),
  accentColor: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  fontSize: (v) => ['small', 'medium', 'large'].includes(v), reduceMotion: boolean,
});
const updateDataUsage = updateSection('dataUsage', {
  downloadOverWifiOnly: boolean, autoPlayVideos: boolean,
  imageQuality: (v) => ['low', 'medium', 'high', 'auto'].includes(v),
});

function getHelp(req, res) {
  const link = (key) => /^https?:\/\//.test(process.env[key] || '') ? process.env[key] : null;
  return res.json({
    faqUrl: link('HELP_FAQ_URL'), supportUrl: link('HELP_SUPPORT_URL'),
    termsUrl: link('TERMS_URL'), privacyPolicyUrl: link('PRIVACY_POLICY_URL'),
    supportRequestEndpoint: '/api/users/me/support-requests',
  });
}

async function createSupportRequest(req, res) {
  const { type, subject, message, appVersion = '', platform = 'unknown' } = req.body;
  if (!['support', 'bug'].includes(type) || typeof subject !== 'string' || !subject.trim() || subject.length > 150 || typeof message !== 'string' || !message.trim() || message.length > 5000 || typeof appVersion !== 'string' || appVersion.length > 50 || !['ios', 'android', 'web', 'unknown'].includes(platform)) {
    return res.status(400).json({ error: 'Provide type (support or bug), subject (1-150 characters), message (1-5000), and optional appVersion/platform.' });
  }
  const ticket = await SupportRequest.create({ user: req.userId, type, subject: subject.trim(), message: message.trim(), appVersion, platform });
  return res.status(201).json({ request: { id: ticket.id, type, status: ticket.status, createdAt: ticket.createdAt } });
}

module.exports = { getSettings, getAccount, updateAccount, changePassword, getNotifications, getAppearance, updateAppearance, getDataUsage, updateDataUsage, getHelp, createSupportRequest };
