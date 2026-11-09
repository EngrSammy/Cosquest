const mongoose = require('mongoose');

/**
 * One row per user per conversation, tracking what's per-viewer:
 * `lastReadAt` drives the unread badge in the chat list and (for DMs) the
 * read-receipt checkmark on the other person's sent messages. Created lazily
 * the first time a user opens a conversation - even for community/faction
 * rooms, whose membership itself is never stored here (see Conversation.js).
 *
 * `receiptsFrozenAt`: when this user turns read receipts OFF, their
 * lastReadAt at that moment is copied here (see privacyController). Others
 * keep seeing messages up to that point as read; anything read after it
 * isn't shown as read. Cleared when they turn read receipts back on.
 *
 * Groups (type 'group'): a row WITH a `role` means that person is a member
 * (owner / admin / member). Rows without a role are just read positions
 * (e.g. faction groups, whose members are pulled in by faction).
 */
const conversationMemberSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lastReadAt: { type: Date, default: () => new Date(0) },
    receiptsFrozenAt: { type: Date, default: null },

    role: { type: String, enum: ['owner', 'admin', 'member', null], default: null },
    joinedAt: { type: Date, default: null },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Notifications muted (by this person) until this moment (far future =
    // "always"). null = not muted.
    mutedUntil: { type: Date, default: null },

    // Groups - set by admins: this person can read but not send until then
    // (far future = until unmuted).
    mutedByAdminUntil: { type: Date, default: null },
    mutedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // When this person last sent a message here (slow mode).
    lastMessageAt: { type: Date, default: null },

    // "Mute only Sparks / thread activity": replies posted inside Sparks
    // don't count as unread; the main chat stays audible.
    sparksMuted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationMemberSchema.index({ conversation: 1, user: 1 }, { unique: true });
conversationMemberSchema.index({ conversation: 1, role: 1 });

module.exports = mongoose.model('ConversationMember', conversationMemberSchema);
