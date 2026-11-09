const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { verifyToken, isCurrentSession } = require('../utils/token');
const userModel = require('../models/userModel');
const Post = require('../models/Post');
const { duplicateRedisClient } = require('../config/redis');
const { markOnline, markOffline, notifyPresenceChange } = require('./presence');
// NOT required at top level: chatController.js requires this file back (to
// emit events after a mutation), so requiring it here up-front would create
// a load-order circle. Required lazily inside initSocket() instead, which
// only ever runs after the whole app - including chatController - has
// already finished loading (server.js calls it from startServer()).

/**
 * Real-time layer for everything that needs an instant push instead of the
 * client polling REST: new/edited/deleted chat messages, reactions, read
 * receipts, typing indicators, presence, and notifications.
 *
 * This does NOT replace the REST API - every mutation still goes through
 * the normal controllers (auth, validation, persistence). Socket.IO is only
 * used to fan the *result* of a successful REST call out to whoever else is
 * looking at that conversation right now. If a client is offline when an
 * event fires, it simply falls back to what it gets from REST (GET
 * /api/chats, GET /api/chats/:id/messages) the next time it loads.
 *
 * Rooms:
 *  - `user:<userId>`         every socket for a given account joins this on
 *                             connect - used for account-wide pushes
 *                             (notifications, DM previews, presence) that
 *                             don't need the client to have a conversation
 *                             open.
 *  - `conversation:<id>`     joined on request (`conversation:join`) after
 *                             the same membership check the REST layer uses
 *                             (loadConversationForUser), so someone can't
 *                             listen in on a faction room they're not in or
 *                             a DM that isn't theirs.
 *  - `post:<id>`              joined on request (`post:join`). Posts have no
 *                             REST access control (GET /posts/:postId is
 *                             public), so the only check is that the post
 *                             actually exists - unlike conversation:join,
 *                             there's no membership to verify.
 *
 * Multi-instance: `io.to(room).emit(...)` only reaches sockets connected to
 * *this* process by default - if this ever runs as more than one server
 * process (behind a load balancer, multiple dynos/pods), a message saved by
 * the process handling the REST call would never reach a recipient whose
 * socket happens to be connected to a different process. The Redis adapter
 * below fixes that: every instance publishes emitted events to Redis, and
 * every instance (including the one that emitted) subscribes and
 * re-broadcasts to its own local sockets, so `emitToConversation` etc. work
 * the same regardless of how many processes are running or which one
 * handled the originating HTTP request. Presence (see ./presence.js) uses
 * the same Redis connection for the same reason: "who's online" has to be
 * one shared answer, not one guess per process.
 */

let io = null;
let adapterClients = null; // { pubClient, subClient } - kept for closeSocket() to clean up on shutdown

async function initSocket(httpServer) {
  const { loadConversationForUser } = require('../controllers/chatController');

  io = new Server(httpServer, {
    cors: { origin: '*' }, // tighten to your real frontend origin(s) in production
  });

  const pubClient = duplicateRedisClient();
  const subClient = duplicateRedisClient();
  // Without a listener, an 'error' event on either connection (e.g. a Redis
  // network blip) is an uncaught exception that crashes the whole process -
  // ioredis warns about this loudly ("missing 'error' handler") for exactly
  // that reason. ioredis auto-reconnects on its own; these just stop it from
  // being fatal.
  pubClient.on('error', (err) => console.error('[socket] redis pub client error:', err.message));
  subClient.on('error', (err) => console.error('[socket] redis sub client error:', err.message));
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  adapterClients = { pubClient, subClient };

  // Handshake auth: client connects with `io(url, { auth: { token: '<JWT>' } })`,
  // the same bearer token already used for REST. Mirrors requireAuth in
  // src/middleware/auth.js, including the tokenVersion/logout check.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Missing auth token'));

      const decoded = verifyToken(token);
      const user = await userModel.findById(decoded.sub);
      if (!user) return next(new Error('User no longer exists'));
      if (decoded.tokenVersion !== user.tokenVersion) return next(new Error('Session logged out'));
      if (!isCurrentSession(decoded, user)) return next(new Error('Signed in on another device'));

      socket.userId = String(user._id);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    // Sparks: the SDK's protocol channel (`sparks` event). See src/sparks/index.js.
    require('../sparks').bindSocket(socket);

    // Presence: only announce on the actual 0->1 / 1->0 transition (see
    // presence.js), so opening a second tab doesn't re-announce "online" and
    // closing one of several doesn't falsely announce "offline".
    markOnline(socket.userId)
      .then((justCameOnline) => {
        if (justCameOnline) return notifyPresenceChange(io, socket.userId, 'presence:online');
      })
      .catch((err) => console.error('[socket] presence online update failed:', err.message));

    socket.on('disconnect', () => {
      markOffline(socket.userId)
        .then((justWentOffline) => {
          if (justWentOffline) return notifyPresenceChange(io, socket.userId, 'presence:offline');
        })
        .catch((err) => console.error('[socket] presence offline update failed:', err.message));
    });

    socket.on('conversation:join', async (conversationId, ack) => {
      const user = await userModel.findById(socket.userId);
      const { conversation, error } = user ? await loadConversationForUser(conversationId, user) : { error: { message: 'User no longer exists.' } };
      if (error) return ack?.({ ok: false, error: error.message });
      socket.join(`conversation:${conversation.id}`);
      ack?.({ ok: true });
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('post:join', async (postId, ack) => {
      if (!mongoose.isValidObjectId(postId) || !(await Post.exists({ _id: postId }))) {
        return ack?.({ ok: false, error: 'Post not found.' });
      }
      socket.join(`post:${postId}`);
      ack?.({ ok: true });
    });

    socket.on('post:leave', (postId) => {
      socket.leave(`post:${postId}`);
    });

    // Typing indicator: purely ephemeral, never persisted. `payload` is just
    // the conversationId; we trust room membership (join already checked
    // access) rather than re-validating on every keystroke.
    socket.on('typing:start', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId: socket.userId });
    });
    socket.on('typing:stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId: socket.userId });
    });
  });

  return io;
}

function getIO() {
  return io;
}

/**
 * Shuts the socket layer down cleanly: closes every open socket, then quits
 * the two dedicated Redis connections the adapter opened in initSocket().
 * Those are separate from - and NOT closed by - the shared client in
 * src/config/redis.js (see duplicateRedisClient), so without this they're
 * simply abandoned: fine for a process that's about to exit anyway (as in
 * production), but in a long-lived test process they sit there retrying
 * to reconnect to a Redis that was deliberately shut down, and eventually
 * print connection errors. Call this before disconnectRedis() on shutdown.
 */
async function closeSocket() {
  if (io) {
    await new Promise((resolve) => io.close(resolve));
    io = null;
  }
  if (adapterClients) {
    await Promise.all([adapterClients.pubClient.quit(), adapterClients.subClient.quit()]);
    adapterClients = null;
  }
}

/** Push to everyone currently viewing a conversation (has joined its room). */
function emitToConversation(conversationId, event, payload) {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

/**
 * Same as emitToConversation, but skips every account in `excludeUserIds`
 * (every one of their sockets, on every device - `user:<id>` is joined by
 * all of them). Use this whenever a payload carries the content of a
 * specific message: someone may have "deleted [it] for me"
 * (Message.deletedFor), which every REST read already respects
 * (see hiddenFor() in chatController.js) - a room-wide broadcast built from
 * one actor's viewpoint must not hand that content to a viewer who hid it,
 * even though they're sitting in the same conversation room.
 */
function emitToConversationExcept(conversationId, excludeUserIds, event, payload) {
  if (!excludeUserIds?.length) return emitToConversation(conversationId, event, payload);
  io?.to(`conversation:${conversationId}`).except(excludeUserIds.map((id) => `user:${id}`)).emit(event, payload);
}

/** Push to every connected socket for one account, regardless of what they have open. */
function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Push the same event to several accounts in one call. */
function emitToUsers(userIds, event, payload) {
  if (!userIds?.length) return;
  io?.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
}

/**
 * Called right after rotating a user's currentSessionId (login, OAuth,
 * resume-signup, password/email change - see src/utils/token.js's
 * generateSessionId). At this moment, whatever socket is sitting in
 * `user:<userId>` is necessarily still holding the *old*, now-invalidated
 * session - the new device hasn't connected a socket with its new session
 * yet - so the room can be told and cleared outright: emit session:revoked
 * so the client can show "signed in on another device" before it goes, then
 * force-close the connection so it doesn't linger with a dead session
 * (it would otherwise only find out on its next REST call or reconnect,
 * via requireAuth/the handshake's own sessionId check).
 */
function revokeSession(userId, reason = 'signed_in_elsewhere') {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit('session:revoked', { reason });
  io.in(room).disconnectSockets(true);
}

/** Push to everyone currently viewing a post (has joined its room via post:join). */
function emitToPost(postId, event, payload) {
  io?.to(`post:${postId}`).emit(event, payload);
}

module.exports = { initSocket, getIO, closeSocket, emitToConversation, emitToConversationExcept, emitToUser, emitToUsers, emitToPost, revokeSession };
