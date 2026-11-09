const express = require('express');
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  createGroup,
  discoverGroups,
  getGroup,
  updateGroup,
  listGroupMembers,
  addGroupMembers,
  joinGroup,
  getInvite,
  joinByInvite,
  resetInviteLink,
  leaveGroup,
  muteGroup,
  listJoinRequests,
  decideJoinRequest,
  setMemberRole,
  removeMember,
  banMember,
  listBans,
  unbanMember,
  muteMember,
  unmuteMember,
  cancelMyRequest,
} = require('../controllers/groupController');

const router = express.Router();

// User-created groups (group chat spec). The group's messages use the normal
// chat endpoints: /api/chats/:groupId/messages etc. (a group's id IS its
// conversation id).
// Scoped to '/groups' because this router is mounted at '/'.
router.use('/groups', requireAuth, requireCompletedOnboarding);

router.post('/groups', upload.single('photo'), asyncHandler(createGroup));
router.get('/groups/discover', asyncHandler(discoverGroups));
// Invite links - placed before /groups/:groupId so "invite" is never read as an id.
router.get('/groups/invite/:code', asyncHandler(getInvite));
router.post('/groups/invite/:code/join', asyncHandler(joinByInvite));

router.get('/groups/:groupId', asyncHandler(getGroup));
router.patch('/groups/:groupId', upload.single('photo'), asyncHandler(updateGroup));
router.get('/groups/:groupId/members', asyncHandler(listGroupMembers));
router.post('/groups/:groupId/members', asyncHandler(addGroupMembers));
router.post('/groups/:groupId/join', asyncHandler(joinGroup));
router.post('/groups/:groupId/leave', asyncHandler(leaveGroup));
router.patch('/groups/:groupId/mute', asyncHandler(muteGroup));
router.post('/groups/:groupId/invite-link/reset', asyncHandler(resetInviteLink));
router.get('/groups/:groupId/requests', asyncHandler(listJoinRequests));
router.delete('/groups/:groupId/requests/mine', asyncHandler(cancelMyRequest));
router.post('/groups/:groupId/requests/:requestId/:decision', asyncHandler(decideJoinRequest));

// Admins (Phase 3)
router.post('/groups/:groupId/members/:userId/role', asyncHandler(setMemberRole));
router.post('/groups/:groupId/members/:userId/remove', asyncHandler(removeMember));
router.post('/groups/:groupId/members/:userId/ban', asyncHandler(banMember));
router.post('/groups/:groupId/members/:userId/mute', asyncHandler(muteMember));
router.delete('/groups/:groupId/members/:userId/mute', asyncHandler(unmuteMember));
router.get('/groups/:groupId/bans', asyncHandler(listBans));
router.delete('/groups/:groupId/bans/:userId', asyncHandler(unbanMember));

module.exports = router;
