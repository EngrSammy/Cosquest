const mongoose = require('mongoose');
const { FACTION_KEYS } = require('./factionModel');

const moneySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN', trim: true, uppercase: true },
  },
  { _id: false }
);

const questSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    coverImageUrl: { type: String, default: '' },
    hostName: { type: String, default: 'CosQuest', trim: true },
    status: {
      type: String,
      enum: ['draft', 'upcoming', 'live', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    location: {
      name: { type: String, required: true, trim: true },
      address: { type: String, default: '', trim: true },
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    prizePool: { type: moneySchema, required: true },
    entryFee: { type: moneySchema, required: true },
    maxParticipants: { type: Number, required: true, min: 1 },
    registrationCount: { type: Number, default: 0, min: 0 },
    interests: { type: [String], default: [] },
    // Optional label, not a registration gate - anyone can register for any
    // quest regardless of their own faction. Only used to tally a faction's
    // "Active Quests" count and any faction-branded display.
    faction: { type: String, enum: FACTION_KEYS, default: null, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    isSeedData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

questSchema.index({ isPublished: 1, status: 1, startsAt: 1 });

module.exports = mongoose.model('Quest', questSchema);
