/**
 * Maps a CosQuest Message document onto the Sparks module's MessageRow
 * (DATA_CONTRACT §5 ChatMessage + hintState). The app does the same mapping
 * for sdk.sparks.ingest (examples/expo-chat/sparks.js: toChatMessage), so
 * keep the two in step.
 */

// Their message kinds -> the module's five.
const KIND = {
  text: 'text',
  image: 'media',
  video: 'media',
  file: 'media',
  sticker: 'media',
  album: 'media',
  audio: 'voice',
  call: 'system',
  game_invite: 'system',
};

function idOf(value) {
  if (!value) return null;
  return String(value._id || value);
}

function textOf(doc) {
  if (doc.deletedForEveryone) return ''; // never hand a deleted message's words to a phone
  if (doc.kind === 'audio') return doc.media?.transcript || doc.content || '';
  if (doc.kind === 'call') return '';
  return doc.content || '';
}

/** Message document (lean or hydrated) -> MessageRow. Null if it has no seq yet. */
function toMessageRow(doc) {
  if (!doc || typeof doc.seq !== 'number') return null;
  const row = {
    messageId: String(doc._id),
    chatId: idOf(doc.conversation),
    seq: doc.seq,
    senderId: idOf(doc.sender),
    kind: KIND[doc.kind] || 'text',
    text: textOf(doc),
    sentAt: new Date(doc.createdAt || Date.now()).toISOString(),
    sparkId: doc.sparkId || null,
    hintState: doc.sparkHintState || 'none',
  };
  if (doc.replyTo) row.replyToMessageId = idOf(doc.replyTo);
  if (typeof doc.sparkRevivalIndex === 'number') row.sparkRevivalIndex = doc.sparkRevivalIndex;
  if (doc.postedInSpark && doc.sparkId) row.postedInSpark = true;
  if (doc.deletedForEveryone) row.deleted = true;
  return row;
}

module.exports = { KIND, toMessageRow };
