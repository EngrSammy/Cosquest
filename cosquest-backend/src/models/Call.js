const mongoose = require('mongoose');

// One document per call. A call always starts in a DM (one-to-one), and
// anyone in it can then add more people - it becomes a group call.
//
// Call status (the call as a whole):
//   ringing   - nobody has answered yet
//   accepted  - at least two people are talking
//   declined  - everyone invited said no
//   missed    - nobody answered in time
//   cancelled - the caller hung up before anyone answered
//   ended     - the call finished after being answered
//
// Each person also has their own status in `members`:
//   ringing   - their phone is ringing
//   joined    - they're in the call
//   declined  - they said no
//   missed    - they didn't answer within 45 seconds
//   left      - they were in the call and left (they can join again)

const MAX_IN_CALL = 8; // people ringing or in the call at the same time
const MAX_EVER_INVITED = 30; // everyone who was ever part of one call

const callMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['ringing', 'joined', 'declined', 'missed', 'left'],
      required: true,
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedAt: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
  },
  { _id: false }
);

const callSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    conversationType: { type: String, enum: ['dm'], default: 'dm' },
    type: { type: String, enum: ['audio', 'video'], required: true },
    status: {
      type: String,
      enum: ['ringing', 'accepted', 'declined', 'missed', 'cancelled', 'ended'],
      default: 'ringing',
      index: true,
    },
    // True while the call is ringing or in progress (set automatically).
    active: { type: Boolean, default: true, select: false },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // True once someone has been added to the call.
    isGroup: { type: Boolean, default: false },
    // Everyone who was ever part of this call (caller included). Used for
    // "can this person see this call?".
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (participants) =>
          participants.length >= 2 && participants.length <= MAX_EVER_INVITED,
        message: `A call needs between 2 and ${MAX_EVER_INVITED} people.`,
      },
    },
    // Each person's own status in this call.
    members: { type: [callMemberSchema], default: [] },
    // Who is ringing or in the call right now (set automatically). Used for
    // "is this person already on a call?".
    activeMembers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    roomName: { type: String, required: true, unique: true },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Two people acting on the same call at the same moment (e.g. both
    // answering) can't overwrite each other: the second save is retried.
    optimisticConcurrency: true,
  }
);

callSchema.pre('validate', function keepActiveStateConsistent(next) {
  this.active = ['ringing', 'accepted'].includes(this.status);
  this.activeMembers = this.active
    ? this.members
        .filter((member) => ['ringing', 'joined'].includes(member.status))
        .map((member) => member.user?._id || member.user)
    : [];
  next();
});

// "Is anyone calling me?"
callSchema.index({ participants: 1, status: 1, createdAt: -1 });

// "Is this person already ringing or on a call?"
callSchema.index({ activeMembers: 1 });

// One active call per DM, even when two start requests arrive together.
callSchema.index(
  { conversation: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);

const Call = mongoose.model('Call', callSchema);

Call.MAX_IN_CALL = MAX_IN_CALL;

// The old one-to-one version had a unique index allowing each person in only
// one active call, built on `participants`. That index would block group
// calls, so it's removed automatically once, on startup. ("Already on
// another call" is now checked in the controller, using `activeMembers`.)
function dropLegacyIndex() {
  Call.collection.dropIndex('participants_1').catch(() => {
    // Already removed (or never existed) - nothing to do.
  });
}

if (mongoose.connection.readyState === 1) {
  dropLegacyIndex();
} else {
  mongoose.connection.once('open', dropLegacyIndex);
}

module.exports = Call;
