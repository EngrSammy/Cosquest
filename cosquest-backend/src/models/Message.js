const mongoose = require('mongoose');

const messageMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
    durationSeconds: { type: Number, default: null },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    waveform: { type: [Number], default: undefined },
    transcript: { type: String, default: null },
    transcribing: { type: Boolean, default: false },
  },
  { _id: false }
);

// One "call entry" per finished call - see src/utils/callMessage.js. callId
// is what the unique index below dedupes on, so the same call never produces
// two log entries even if its finished status gets broadcast more than once.
// A poll (kind 'poll'). `content` holds the question too, so previews,
// search and replies work like any other message. Votes live in PollVote.
const pollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    options: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          text: { type: String, required: true, trim: true, maxlength: 100 },
        },
      ],
      default: [],
    },
    // Several answers allowed per person.
    multiple: { type: Boolean, default: false },
    // Only counts are shown, never who voted for what.
    anonymous: { type: Boolean, default: false },
    // Closes by itself at this time (null = no end).
    closesAt: { type: Date, default: null },
    // Closed early by the creator (or a group admin).
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const callLogSchema = new mongoose.Schema(
  {
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true },
    type: { type: String, enum: ['audio', 'video'], required: true },
    status: { type: String, enum: ['declined', 'missed', 'cancelled', 'ended'], required: true },
    durationSeconds: { type: Number, default: null },
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Group calls: true once someone was added, and how many people were
    // actually in the call at some point.
    groupCall: { type: Boolean, default: false },
    participantCount: { type: Number, default: null },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['text', 'image', 'video', 'audio', 'file', 'sticker', 'call', 'album', 'poll', 'game_invite', 'game_result'], default: 'text' },
    content: { type: String, default: '', trim: true, maxlength: 2000 },
    media: { type: messageMediaSchema, default: null },
    callLog: { type: callLogSchema, default: null },
    // kind 'poll': the question, options and settings (votes: PollVote).
    poll: { type: pollSchema, default: null },

    // kind 'album': several photos/videos in one message (each item is what
    // storeChatMedia returns, plus its kind). The caption is `content`.
    album: { type: [mongoose.Schema.Types.Mixed], default: undefined },

    // SPARKS: the sub-conversation this message belongs to (set by the
    // Sparks bot, a manual "Start a Spark", or a reply posted inside one).
    // The message still shows in the main chat, with a marker.
    spark: { type: mongoose.Schema.Types.ObjectId, ref: 'Spark', default: null, index: true },
    // Which "era" of the Spark it belongs to (0 = first; each revival adds
    // one) - drives the past/present colour gradient.
    sparkEra: { type: Number, default: 0 },
    // Posted from inside the Spark panel (vs. picked up from the main chat).
    postedInSpark: { type: Boolean, default: false },

    // SPARKS MODULE (@cosquest/sparks-backend, see SPARKS_INTEGRATION.md).
    // `seq`: per-conversation sequence number, strictly increasing, assigned
    // atomically at insert by the pre('save') hook below (MessageSeqCounter).
    // Messages from before this field existed have none until
    // scripts/backfillMessageSeq.js runs.
    seq: { type: Number, default: undefined },
    // The module's Spark (string id like "spk_..."; lives in sparks_sparks).
    // Separate from the legacy `spark`/`sparkEra` above, which only the
    // legacy engine (SPARKS_ENGINE=legacy) writes.
    sparkId: { type: String, default: null },
    // The Spark's revival index when this message joined (colour marker).
    sparkRevivalIndex: { type: Number, default: undefined },
    // pending | none | judged | assigned: the module's sorting bookkeeping.
    sparkHintState: { type: String, enum: ['pending', 'none', 'judged', 'assigned'], default: 'none' },
    // kind 'game_invite': an invitation into the CostQuest game (merged app),
    // a raid, a shrine or a duel at a place and maybe a time. Tapping Join
    // swipes into the game and opens it there. `content` is the optional note.
    gameInvite: {
      type: new mongoose.Schema(
        {
          type: { type: String, enum: ['raid', 'shrine', 'duel'], required: true },
          targetId: { type: String, required: true, maxlength: 80 },
          place: { type: String, default: '', maxlength: 80 },
          lat: { type: Number, default: null },
          lng: { type: Number, default: null },
          startsAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Polish (task 059): kind 'game_result', a CostQuest result shared to a
    // chat as a card. `content` holds the same result as one line of text, so
    // apps without the card still show something readable.
    gameResult: {
      type: new mongoose.Schema(
        {
          headline: { type: String, required: true, maxlength: 80 },
          pointName: { type: String, default: '', maxlength: 80 },
          realm: { type: String, default: '', maxlength: 24 },
          win: { type: Boolean, default: false },
          xp: { type: Number, default: 0, min: 0, max: 100000 },
          coins: { type: Number, default: 0, min: 0, max: 100000 },
          level: { type: Number, default: null, min: 0, max: 1000 },
          rank: { type: String, default: '', maxlength: 40 },
        },
        { _id: false }
      ),
      default: undefined,
    },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    // Set when this message was created by forwarding another one, so the UI
    // can show a "Forwarded" label. Points at the original message; the
    // content/media above are this message's own copy, not a live reference.
    forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },

    // Set when the sender edits `content`; kept separate from `updatedAt` so
    // reactions/reads (which don't touch this document) can't be confused
    // with an actual edit.
    editedAt: { type: Date, default: null },

    // A group admin deleted it (shown as "deleted by an admin").
    deletedByAdmin: { type: Boolean, default: false },

    // Earlier versions of `content`, newest last, so the author can undo an
    // accidental edit (POST .../rollback). Never sent to other people: only
    // the author knows a message was edited.
    editHistory: {
      type: [
        {
          _id: false,
          content: { type: String, default: '' },
          editedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // @ mentions: the people tagged in this message (checkbox picker in the
    // app), or everyone in the chat. Mentioned people get a notification.
    mentions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    mentionsEveryone: { type: Boolean, default: false },

    // "Delete for everyone": the row is NEVER removed from the database -
    // only flagged, so it stays auditable. The controller hides the real
    // content/media once this is true and serves a tombstone instead.
    deletedForEveryone: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    // "Delete for me": each id here has hidden this message from their own
    // view only; everyone else (and the raw document) is unaffected.
    deletedFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
// Sparks module: per-chat order, and a Spark's messages in order. Partial so
// legacy rows without a seq / sparkId are not indexed (and never collide).
messageSchema.index({ conversation: 1, seq: 1 }, { unique: true, partialFilterExpression: { seq: { $type: 'number' } } });
messageSchema.index({ sparkId: 1, seq: 1 }, { partialFilterExpression: { sparkId: { $type: 'string' } } });

// Assigns `seq` to every new message, whatever code path creates it
// (Message.create / doc.save()). One atomic $inc per insert on the
// conversation's counter. NOTE: Message.insertMany() does not run this hook;
// nothing in the codebase uses it for messages - if you add one, assign seq
// with MessageSeqCounter.next() yourself.
messageSchema.pre('save', async function assignSeq() {
  if (!this.isNew || typeof this.seq === 'number') return;
  const MessageSeqCounter = require('./MessageSeqCounter');
  this.seq = await MessageSeqCounter.next(this.conversation);
});

// Partial, not sparse: only documents where callLog.callId actually exists
// are indexed, so this never conflicts with the other 99% of messages - it
// only stops the same call from getting a second log entry (see
// recordCallMessage's E11000 handling).
messageSchema.index(
  { 'callLog.callId': 1 },
  { unique: true, partialFilterExpression: { 'callLog.callId': { $exists: true } } }
);

module.exports = mongoose.model('Message', messageSchema);
