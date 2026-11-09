/**
 * SparksPorts for @cosquest/sparks-backend over CosQuest's Socket.IO rooms
 * and Mongo data (see the module's dist/ports.d.ts and
 * docs/guides/BACKEND_INTEGRATION.md §3).
 *
 * Socket rooms used:
 *  - `sparksdevice:<deviceId>`  one SDK install. A socket joins it when it
 *                               sends device.register (BEFORE the module
 *                               handles it - the reply goes out through
 *                               send() during handle()); see index.js.
 *  - `user:<userId>`            existing; every socket of an account.
 *  - `conversation:<id>`        existing; everyone viewing a chat.
 * Everything Sparks sends travels on the `sparks` event. Sockets without an
 * SDK simply have no listener for it. Job inputs and history bundles are
 * HPKE-sealed to one device, so extra recipients learn nothing.
 */
const members = require('./members');
const compat = require('./compat');

function createPorts({ getIO, store, log }) {
  const emit = (rooms, msg) => {
    const io = getIO();
    if (!io || !rooms.length) return;
    io.to(rooms).emit('sparks', msg);
  };

  return {
    store,

    async send(deviceId, msg) {
      emit([`sparksdevice:${deviceId}`], msg);
    },

    async broadcastToChat(chatId, msg) {
      const list = await members.chatMembers(chatId);
      // Members' own rooms (they get it even with the chat closed) plus anyone
      // viewing the chat right now (covers implicit-membership rooms past the cap).
      emit([...list.map((m) => `user:${m.userId}`), `conversation:${chatId}`], msg);
      // The app's existing Spark events (spark:updated / spark:messages / spark:deleted).
      if (msg?.type === 'spark.event') {
        await compat.emitLegacyEvent(store, msg.payload).catch((error) => log('warn', 'legacy spark event failed', String(error)));
      }
    },

    async broadcastToCall(callId, msg, exceptUserId) {
      const call = await store.getCall(callId);
      if (!call) return;
      emit(call.attendees.filter((u) => u !== exceptUserId).map((u) => `user:${u}`), msg);
    },

    async sendToUsers(userIds, msg) {
      emit(userIds.map((u) => `user:${u}`), msg);
    },

    chatMembers: (chatId) => members.chatMembers(chatId),
    // Module 1.2: "may this person use this chat?" asked directly, because the
    // member list of Community and faction rooms is capped (engaged members
    // only) and a real member can be missing from it.
    isMember: (userId, chatId) => members.hasAccess(userId, chatId),
    canRead: (userId, chatId, seq) => members.canRead(userId, chatId, seq),
    canReadMany: (userId, chatId, seqs) => members.canReadMany(userId, chatId, seqs),
    isAdmin: (userId, chatId) => members.isAdmin(userId, chatId),

    // OPEN_QUESTIONS Q7, reference default: admins of the call's chat.
    async canIssueTargetedCall(userId, callId) {
      const call = await store.getCall(callId);
      return Boolean(call) && members.isAdmin(userId, call.chatId);
    },

    now: () => new Date(),

    // Role ping -> a normal CosQuest "mention" notification (bell + live push).
    onRolePing(chatId, sparkId, role, userIds) {
      (async () => {
        const spark = await store.getSpark(sparkId);
        const notificationModel = require('../models/notificationModel');
        await notificationModel.createMentionNotifications(userIds, {
          message: `A Spark needs ${role}: "${spark?.subject || 'a new topic'}"`,
          conversation: chatId,
        });
      })().catch((error) => log('warn', 'role ping notification failed', String(error)));
    },

    // Targeted calls ("calling all sergeants"): CosQuest calls are DM-started
    // LiveKit calls; ringing a subset is not wired yet, so this only logs.
    onTargetedCall(cmd, targetUserIds) {
      log('info', `targeted call ${cmd.intent?.action} in ${cmd.callId} -> ${targetUserIds.join(', ')} (not wired to the call layer yet)`);
    },

    log,
  };
}

module.exports = { createPorts };
