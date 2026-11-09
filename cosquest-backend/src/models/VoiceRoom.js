const mongoose = require('mongoose');

// A live voice chat in the Community room or a faction room - like WhatsApp's
// group voice chat. Nobody's phone rings: members see it's live and can join
// and leave whenever they like. It closes when the last person leaves.
//
// Members' apps check in every 30 seconds (POST /api/voice/:roomId/ping).
// Anyone who hasn't checked in for 90 seconds (app closed, lost signal) is
// removed automatically, so a voice chat never stays "live" with nobody in it.

const MAX_MEMBERS = 50;
const STALE_AFTER_MS = 90 * 1000;

const voiceMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const voiceRoomSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    conversationType: { type: String, enum: ['community', 'faction'], required: true },
    factionKey: { type: String, default: null },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [voiceMemberSchema], default: [] },
    roomName: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    endedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Two people joining at the same moment can't overwrite each other.
    optimisticConcurrency: true,
  }
);

// One live voice chat per room, even when two people start one together.
voiceRoomSchema.index(
  { conversation: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

// "Which voice chat is this person in?"
voiceRoomSchema.index({ 'members.user': 1, active: 1 });

const VoiceRoom = mongoose.model('VoiceRoom', voiceRoomSchema);

VoiceRoom.MAX_MEMBERS = MAX_MEMBERS;
VoiceRoom.STALE_AFTER_MS = STALE_AFTER_MS;

module.exports = VoiceRoom;
