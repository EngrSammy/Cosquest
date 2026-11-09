/**
 * Polish (docs/polish/BACKEND-PORT.md): a phone push for a new chat message,
 * to the DM partner or the group's members who are not connected right now
 * (connected people get it live over the socket) and have not muted the
 * chat. Community and faction rooms never push. Never throws.
 */
const ConversationMember = require('../models/ConversationMember');
const presence = require('../realtime/presence');
const push = require('./push');

function preview(message) {
  if (message.content) return String(message.content).slice(0, 140);
  if (message.type && message.type !== 'text') return `Sent ${message.type === 'image' ? 'a photo' : message.type === 'video' ? 'a video' : message.type === 'voice' ? 'a voice note' : 'something'}`;
  return 'New message';
}

async function pushNewMessage(conversation, message, sender, { memberIds = [] } = {}) {
  if (!push.enabled()) return { sent: 0, skipped: 'disabled' };
  try {
    if (conversation.type !== 'dm' && conversation.type !== 'group') return { sent: 0 };
    if (conversation.group?.kind === 'faction') return { sent: 0 };
    const senderId = String(sender?._id || sender?.id || message.sender);
    const candidates = (conversation.type === 'dm' ? conversation.participants : memberIds).map(String).filter((id) => id !== senderId);
    if (!candidates.length) return { sent: 0 };
    const now = new Date();
    const muted = await ConversationMember.find(
      { conversation: conversation._id, user: { $in: candidates }, mutedUntil: { $gt: now } },
      'user'
    );
    const mutedIds = new Set(muted.map((row) => String(row.user)));
    const offline = [];
    for (const id of candidates) {
      if (mutedIds.has(id)) continue;
      if (await presence.isOnline(id).catch(() => false)) continue;
      offline.push(id);
    }
    const name = sender?.profile?.username || sender?.profile?.firstName || 'Someone';
    const title = conversation.type === 'dm' ? name : conversation.group?.name || 'Group';
    const body = conversation.type === 'dm' ? preview(message) : `${name}: ${preview(message)}`;
    return push.sendToUsers(offline, {
      title,
      body,
      data: { type: 'message', conversationId: String(conversation._id), messageId: String(message._id) },
    });
  } catch (error) {
    console.error('[push] message push failed:', error.message);
    return { sent: 0, error: error.message };
  }
}

module.exports = { pushNewMessage };
