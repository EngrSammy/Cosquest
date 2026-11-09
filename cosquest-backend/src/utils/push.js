/**
 * Phone push notifications through Expo's push service (the app registers
 * an Expo push token with POST /api/users/me/devices after the person
 * allows notifications). Polish addition: docs/polish/BACKEND-PORT.md.
 *
 * Off unless PUSH_ENABLED=1, so nothing leaves a dev machine or the test
 * suite by accident. Only people with `preferences.notificationsEnabled`
 * get a push; the in-app notification centre is unaffected either way.
 * EXPO_ACCESS_TOKEN (optional) is sent if the Expo project requires it.
 *
 * Tokens Expo reports as DeviceNotRegistered are removed from the user.
 */
const User = require('../models/User');

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;
const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

async function fetchTransport(messages) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const response = await fetch(EXPO_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body?.data) ? body.data : [];
}

let transport = fetchTransport;
let forceEnabled = null;

function enabled() {
  if (forceEnabled !== null) return forceEnabled;
  return process.env.PUSH_ENABLED === '1';
}

/** Tests: route pushes to `fn(messages) -> tickets` and switch sending on. */
function setTransport(fn) {
  transport = fn || fetchTransport;
  forceEnabled = fn ? true : null;
}

function isExpoToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/**
 * Send one notification to some users. `data` rides along for the app's tap
 * routing ({ type, conversationId, username, link }). `badge` is each
 * person's unread count when `badgeFor` is given. Never throws.
 */
async function sendToUsers(userIds, { title, body, data = {}, badgeFor } = {}) {
  if (!enabled()) return { sent: 0, skipped: 'disabled' };
  try {
    const ids = [...new Set((userIds || []).map(String))];
    if (!ids.length) return { sent: 0 };
    const users = await User.find(
      { _id: { $in: ids }, 'preferences.notificationsEnabled': true, 'devices.0': { $exists: true } },
      'devices'
    );
    const messages = [];
    const owners = [];
    for (const user of users) {
      const badge = badgeFor ? await badgeFor(String(user._id)).catch(() => undefined) : undefined;
      for (const device of user.devices || []) {
        if (!isExpoToken(device.pushToken)) continue;
        messages.push({ to: device.pushToken, title, body, data, sound: 'default', ...(Number.isInteger(badge) ? { badge } : {}) });
        owners.push({ userId: String(user._id), token: device.pushToken });
      }
    }
    let sent = 0;
    const dead = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const tickets = await transport(messages.slice(i, i + CHUNK));
      tickets.forEach((ticket, j) => {
        if (ticket?.status === 'ok') sent += 1;
        else if (ticket?.details?.error === 'DeviceNotRegistered') dead.push(owners[i + j]);
      });
    }
    for (const { userId, token } of dead) {
      await User.updateOne({ _id: userId }, { $pull: { devices: { pushToken: token } } });
    }
    return { sent, removed: dead.length };
  } catch (error) {
    console.error('[push] send failed:', error.message);
    return { sent: 0, error: error.message };
  }
}

module.exports = { sendToUsers, setTransport, isExpoToken, enabled };
