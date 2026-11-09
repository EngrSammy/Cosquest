const express = require('express');
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { chatUpload, albumUpload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  listChats,
  startDirectMessage,
  getConversationDetail,
  listChatMembers,
  listMessages,
  createMessage,
  editMessage,
  rollbackMessage,
  deleteMessage,
  markRead,
  setPinnedMessage,
  setReaction,
  removeReaction,
  getMessageSeenBy,
  forwardMessage,
  bulkDeleteMessages,
  bulkForwardMessages,
  getMessage,
  getChatShareLink,
  setChatNotifications,
} = require('../controllers/chatController');
const { listSparks, listNativeSparks, listSparkMembers, getSpark, startSpark, addToSpark, pinSpark, deleteSpark, mergeSpark } = require('../controllers/sparkController');
const { searchMessages, messageContext, createAlbum } = require('../controllers/chatExtrasController');
const { createPoll, votePoll, closePoll, listPollVotes } = require('../controllers/pollController');
const { createGameInvite, createGameResult } = require('../controllers/gameController');

const router = express.Router();

// Every chat endpoint requires a fully onboarded, logged-in user - there is
// no pre-login chat access, unlike the onboarding-step endpoints elsewhere.
// Scoped to '/chats' because this router is mounted at '/': unscoped, it would
// also re-check the login on every request that falls through to a later
// router (e.g. /api/spotlight).
router.use('/chats', requireAuth, requireCompletedOnboarding);

router.get('/chats', asyncHandler(listChats));
router.post('/chats/dm', asyncHandler(startDirectMessage));
router.get('/chats/:conversationId', asyncHandler(getConversationDetail));
// People in this chat, for the @ mention checkbox picker (?search=&page=&limit=).
router.get('/chats/:conversationId/members', asyncHandler(listChatMembers));
router.get('/chats/:conversationId/share', asyncHandler(getChatShareLink));
router.get('/chats/:conversationId/messages/:messageId', asyncHandler(getMessage));
router.get('/chats/:conversationId/messages/:messageId/share', asyncHandler(getChatShareLink));
router.get('/chats/:conversationId/messages', asyncHandler(listMessages));
router.post('/chats/:conversationId/messages', chatUpload.single('media'), asyncHandler(createMessage));

// Search in chat (M16), a message with the conversation around it (M16), and
// albums - several photos/videos in one message (M17).
router.get('/chats/:conversationId/search', asyncHandler(searchMessages));
// "Mute only Sparks / thread activity" (just for me).
router.patch('/chats/:conversationId/notifications', asyncHandler(setChatNotifications));
router.get('/chats/:conversationId/messages/:messageId/context', asyncHandler(messageContext));
router.post('/chats/:conversationId/album', albumUpload.array('media', 10), asyncHandler(createAlbum));
router.post('/chats/:conversationId/messages/bulk-delete', asyncHandler(bulkDeleteMessages));
router.post('/chats/:conversationId/messages/bulk-forward', asyncHandler(bulkForwardMessages));
router.patch('/chats/:conversationId/messages/:messageId', asyncHandler(editMessage));
// Undo the last edit (author only).
router.post('/chats/:conversationId/messages/:messageId/rollback', asyncHandler(rollbackMessage));
router.delete('/chats/:conversationId/messages/:messageId', asyncHandler(deleteMessage));
router.patch('/chats/:conversationId/read', asyncHandler(markRead));
router.patch('/chats/:conversationId/pinned-message', asyncHandler(setPinnedMessage));
router.post('/chats/:conversationId/messages/:messageId/reactions', asyncHandler(setReaction));
router.delete('/chats/:conversationId/messages/:messageId/reactions', asyncHandler(removeReaction));
router.get('/chats/:conversationId/messages/:messageId/seen', asyncHandler(getMessageSeenBy));
router.post('/chats/:conversationId/messages/:messageId/forward', asyncHandler(forwardMessage));

// Polls (kind 'poll'): create, vote, close, see who voted.
router.post('/chats/:conversationId/polls', asyncHandler(createPoll));

// Game invites (kind 'game_invite', the merged app): raid / shrine / duel cards.
router.post('/chats/:conversationId/game-invites', asyncHandler(createGameInvite));
// Polish (task 059): a game result as a card.
router.post('/chats/:conversationId/game-results', asyncHandler(createGameResult));
router.post('/chats/:conversationId/messages/:messageId/vote', asyncHandler(votePoll));
router.post('/chats/:conversationId/messages/:messageId/poll/close', asyncHandler(closePoll));
router.get('/chats/:conversationId/messages/:messageId/poll/votes', asyncHandler(listPollVotes));

// Sparks (sub-conversations) - every chat, DMs included (Sparks module;
// SPARKS_ENGINE=legacy restores the old engine: no DMs). See SPARKS_INTEGRATION.md.
router.get('/chats/:conversationId/sparks', asyncHandler(listSparks));
// The module's own Spark objects (summary, seams, state) - for web clients.
router.get('/chats/:conversationId/sparks/native', asyncHandler(listNativeSparks));
// Members as Sparks sees them (roles, admin flags), for sdk.sparks.setMembers.
router.get('/chats/:conversationId/sparks/members', asyncHandler(listSparkMembers));
router.post('/chats/:conversationId/sparks', asyncHandler(startSpark));
router.get('/chats/:conversationId/sparks/:sparkId', asyncHandler(getSpark));
router.post('/chats/:conversationId/sparks/:sparkId/messages', asyncHandler(addToSpark));
router.patch('/chats/:conversationId/sparks/:sparkId/pin', asyncHandler(pinSpark));
router.delete('/chats/:conversationId/sparks/:sparkId', asyncHandler(deleteSpark));
router.post('/chats/:conversationId/sparks/:sparkId/merge', asyncHandler(mergeSpark));

module.exports = router;
