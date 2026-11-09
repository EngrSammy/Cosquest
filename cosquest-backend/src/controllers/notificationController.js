const notificationModel = require('../models/notificationModel');

// GET /api/users/me/notifications - the app calls this whenever it opens
async function listNotifications(req, res) {
  const notifications = await notificationModel.listForUser(req.userId);
  return res.json({ notifications: notifications.map(notificationModel.sanitize) });
}

// PATCH /api/users/me/notifications/read - marks everything currently unread as read
async function markRead(req, res) {
  await notificationModel.markAllRead(req.userId);
  return res.json({ message: 'Notifications marked as read.' });
}

module.exports = { listNotifications, markRead };
