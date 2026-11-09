const mongoose = require('mongoose');

/**
 * Four flavors share one collection:
 *  - 'community': exactly one row for the whole app. Every onboarded user is
 *    an implicit member - membership isn't stored, it's just "is logged in".
 *  - 'faction': at most one row per faction key. Membership is implicit too -
 *    it's whoever currently has that `faction` on their User document, so
 *    switching factions moves you between faction rooms automatically.
 *  - 'dm': exactly 2 participants, created on demand. `dmKey` is the two
 *    participant ids sorted and joined, so a unique index can stop the same
 *    pair from getting a second conversation.
 *  - 'group': created by users (group chat spec). Details live in `group`:
 *      kind 'faction' - for one faction (`factionKey`); that faction's
 *                       members are pulled in automatically, like the
 *                       faction room.
 *      kind 'open'    - an open community space anyone can find and join
 *                       (instantly, or after admin approval).
 *      kind 'private' - invite only (added by members, or an invite link).
 *    Explicit members, their role (owner / admin / member) and mute live in
 *    ConversationMember.
 *
 * `participants` is only populated for 'dm'.
 */
const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    photoUrl: { type: String, default: null },
    kind: { type: String, enum: ['faction', 'open', 'private'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Invite link / "join" button: let people in instantly, or ask an admin.
    joinMode: { type: String, enum: ['instant', 'approval'], default: 'instant' },
    sizeLimit: { type: Number, default: 256, min: 2, max: 1024 },
    // Who can see the member list, and who can add new people.
    memberListVisibility: { type: String, enum: ['members', 'admins'], default: 'members' },
    whoCanAdd: { type: String, enum: ['members', 'admins'], default: 'admins' },
    // Local (made by members) or regional (made by orchestrators - set with
    // scripts/setGroupScope.js until orchestrators have their own screen).
    scope: { type: String, enum: ['local', 'regional'], default: 'local' },
    // The code in the invite link (https://.../g/<code>). Admins can reset it.
    inviteCode: { type: String, default: null },
    // Slow mode: members can send one message every N seconds (0 = off).
    // Admins aren't limited.
    slowModeSeconds: { type: Number, enum: [0, 10, 30, 60, 300, 3600], default: 0 },
    // The last person left: the group stays in the database, hidden.
    archived: { type: Boolean, default: false },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['community', 'faction', 'dm', 'group'], required: true },
    factionKey: { type: String, default: null },
    participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    dmKey: { type: String, default: null },
    group: { type: groupSchema, default: null },
    pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    pinnedAt: { type: Date, default: null },
    pinnedUntil: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pinDuration: { type: String, enum: ['24h', '7d', '30d', null], default: null },
    messageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

conversationSchema.index({ type: 1 }, { unique: true, partialFilterExpression: { type: 'community' } });
conversationSchema.index({ type: 1, factionKey: 1 }, { unique: true, partialFilterExpression: { type: 'faction' } });
conversationSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { type: 'dm' } });

// Groups: invite links, discovery, and "faction groups for my faction".
conversationSchema.index(
  { 'group.inviteCode': 1 },
  { unique: true, partialFilterExpression: { 'group.inviteCode': { $type: 'string' } } }
);
conversationSchema.index({ type: 1, 'group.kind': 1, factionKey: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
