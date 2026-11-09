const userModel = require('../models/userModel');
const ConversationMember = require('../models/ConversationMember');

const VISIBILITY_VALUES = ['public', 'friends', 'private'];
const BOOLEAN_FIELDS = [
  'showActivityFeed',
  'allowDirectMessages',
  'showOnlineStatus',
  'allowFriendRequests',
  'readReceipts',
];

// GET /api/users/me/privacy
function getPrivacy(req, res) {
  return res.json({ privacy: req.user.privacy });
}

// PATCH /api/users/me/privacy - Settings > Privacy & Visibility screen.
async function updatePrivacy(req, res) {
  const { profileVisibility } = req.body;

  for (const key of BOOLEAN_FIELDS) {
    if (req.body[key] !== undefined && typeof req.body[key] !== 'boolean') {
      return res.status(400).json({ error: `${key} must be a boolean.` });
    }
  }

  if (profileVisibility !== undefined && !VISIBILITY_VALUES.includes(profileVisibility)) {
    return res.status(400).json({ error: `profileVisibility must be one of: ${VISIBILITY_VALUES.join(', ')}.` });
  }

  // Read receipts: did this request turn them off or back on?
  const wasOn = req.user.privacy?.readReceipts !== false;
  const turningOff = req.body.readReceipts === false && wasOn;
  const turningOn = req.body.readReceipts === true && !wasOn;

  const updated = await userModel.updateUser(req.userId, (user) => {
    if (profileVisibility !== undefined) user.privacy.profileVisibility = profileVisibility;
    for (const key of BOOLEAN_FIELDS) {
      if (req.body[key] !== undefined) user.privacy[key] = req.body[key];
    }
    if (turningOff) user.privacy.readReceiptsOffAt = new Date();
    if (turningOn) user.privacy.readReceiptsOffAt = null;
  });

  // Turning receipts off keeps what was ALREADY read showing as read: copy
  // how far they'd read in every chat right now. Turning them back on clears it.
  if (turningOff) {
    await ConversationMember.updateMany({ user: req.userId }, [{ $set: { receiptsFrozenAt: '$lastReadAt' } }]);
  } else if (turningOn) {
    await ConversationMember.updateMany({ user: req.userId }, { $set: { receiptsFrozenAt: null } });
  }

  return res.json({ privacy: updated.privacy });
}

module.exports = { getPrivacy, updatePrivacy };
