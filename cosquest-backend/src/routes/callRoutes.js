const express = require('express');
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  startCall,
  getIncomingCall,
  getCall,
  acceptCall,
  declineCall,
  endCall,
  rejoinCall,
  inviteToCall,
} = require('../controllers/callController');
const {
  getVoiceRoom,
  joinVoiceRoom,
  pingVoiceRoom,
  leaveVoiceRoom,
} = require('../controllers/voiceRoomController');

const router = express.Router();

// Scoped to this router's own paths: it's mounted at '/' ahead of chatRoutes,
// so an unscoped router.use would also run on every /api/chats request and
// look the user up again before chatRoutes does its own check.
router.use(
  ['/calls', '/chats/:conversationId/calls', '/voice', '/chats/:conversationId/voice'],
  requireAuth,
  requireCompletedOnboarding
);

// Calls (start in a DM; anyone in the call can add more people)
router.post('/chats/:conversationId/calls', asyncHandler(startCall));
// Sparks: the call's outline (attendees and chat admins).
router.get('/calls/:callId/outline', asyncHandler(require('../sparks/calls').getOutline));
router.get('/calls/incoming', asyncHandler(getIncomingCall));
router.get('/calls/:callId', asyncHandler(getCall));
router.post('/calls/:callId/accept', asyncHandler(acceptCall));
router.post('/calls/:callId/decline', asyncHandler(declineCall));
router.post('/calls/:callId/end', asyncHandler(endCall));
router.post('/calls/:callId/invite', asyncHandler(inviteToCall));
router.post('/calls/:callId/join', asyncHandler(rejoinCall));

// Voice chats (Community and faction rooms - nobody's phone rings)
router.get('/chats/:conversationId/voice', asyncHandler(getVoiceRoom));
router.post('/chats/:conversationId/voice/join', asyncHandler(joinVoiceRoom));
router.post('/voice/:roomId/ping', asyncHandler(pingVoiceRoom));
router.post('/voice/:roomId/leave', asyncHandler(leaveVoiceRoom));

module.exports = router;
