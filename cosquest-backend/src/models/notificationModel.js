const User = require('./User');
const Notification = require('./Notification');
const { emitToUser, emitToUsers } = require('../realtime/socket');
const push = require('../utils/push');

const ACTOR_FIELDS = 'profile.username profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl';

/**
 * Drops one Notification per user currently opted in
 * (`preferences.notificationsEnabled`). This is the in-app half of "allow
 * notifications" - it needs no external service, since the message just
 * sits in MongoDB until the person opens the app and asks for it. Returns
 * how many users it was delivered to.
 */
async function createForEnabledUsers(message) {
  const users = await User.find({ 'preferences.notificationsEnabled': true }, '_id');
  if (!users.length) return 0;
  await Notification.insertMany(users.map((u) => ({ user: u._id, message })));
  // Pushes the unread badge/toast live to anyone currently connected;
  // everyone else just sees it next time they open GET /api/users/me/notifications.
  emitToUsers(users.map((u) => String(u._id)), 'notification:new', { message });
  return users.length;
}

/**
 * Unconditional single-user version - used for the welcome notification
 * sent at signup, before the person has ever set `notificationsEnabled`
 * (it defaults to false and isn't chosen until onboarding step 4).
 */
async function createForUser(userId, message, { type = 'system', actor, conversation, chatMessage, link, gameKind, push: sendPush = true } = {}) {
  const notification = await Notification.create({
    user: userId,
    message,
    type,
    actor: actor || null,
    conversation: conversation || null,
    chatMessage: chatMessage || null,
    link: link || null,
    gameKind: gameKind || null,
  });
  if (actor) await notification.populate('actor', ACTOR_FIELDS);
  const clean = sanitize(notification);
  emitToUser(String(userId), 'notification:new', clean);
  // Polish: the same notification as a phone push (off unless PUSH_ENABLED=1).
  if (sendPush && type !== 'system') {
    void push.sendToUsers([userId], {
      title: type === 'game' ? 'CosQuest' : type === 'follow' ? 'New follower' : 'CosQuest',
      body: message,
      data: { type, notificationId: clean.id, conversationId: clean.conversationId, username: clean.actor?.username || null, link: clean.link },
      badgeFor: unreadCount,
    });
  }
  return notification;
}

/** Unread notifications for the app badge (pushes carry it). */
async function unreadCount(userId) {
  return Notification.countDocuments({ user: userId, read: false });
}

/**
 * "@ mention" notifications for many people at once (one row each), sent
 * live to whoever is connected. Used for "@everyone" in big rooms too, so
 * it inserts in batches instead of one by one.
 */
async function createMentionNotifications(userIds, { message, actor, conversation, chatMessage }) {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return 0;

  const actorDoc = actor ? await User.findById(actor).select(ACTOR_FIELDS) : null;
  const BATCH = 500;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const docs = await Notification.insertMany(
      batch.map((userId) => ({
        user: userId,
        message,
        type: 'mention',
        actor: actor || null,
        conversation: conversation || null,
        chatMessage: chatMessage || null,
      }))
    );

    // Same payload for everyone in the batch (only the id differs, and the
    // app refetches the list anyway when it opens Notifications).
    const sample = sanitize({ ...docs[0].toObject(), actor: actorDoc });
    emitToUsers(batch, 'notification:new', { ...sample, id: null });
    // Polish: a phone push for each (off unless PUSH_ENABLED=1).
    void push.sendToUsers(batch, {
      title: 'You were mentioned',
      body: message,
      data: { type: 'mention', conversationId: sample.conversationId, messageId: sample.messageId },
    });
  }

  return ids.length;
}

async function listForUser(userId) {
  return Notification.find({ user: userId })
    .populate('actor', ACTOR_FIELDS)
    .sort({ createdAt: -1 });
}

async function markAllRead(userId) {
  await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });
}

function sanitize(n) {
  const actor = n.actor && typeof n.actor === 'object' && n.actor.profile
    ? {
        id: String(n.actor._id),
        username: n.actor.profile.username,
        name: [n.actor.profile.firstName, n.actor.profile.lastName].filter(Boolean).join(' '),
        avatarKey: n.actor.profile.avatarKey,
        avatarPhotoUrl: n.actor.profile.avatarPhotoUrl,
      }
    : null;
  return {
    id: n._id ? String(n._id) : null,
    type: n.type,
    message: n.message,
    actor,
    conversationId: n.conversation ? String(n.conversation) : null,
    messageId: n.chatMessage ? String(n.chatMessage) : null,
    link: n.link || null,
    gameKind: n.gameKind || null,
    read: n.read,
    createdAt: n.createdAt,
  };
}

module.exports = { createForEnabledUsers, createForUser, createMentionNotifications, listForUser, markAllRead, sanitize, unreadCount };
