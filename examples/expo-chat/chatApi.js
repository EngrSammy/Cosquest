import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

const LIMIT_MB = { image: 10, video: 50, audio: 10, file: 10, sticker: 1 };

// baseUrl is the server origin, without /api. Read the current session token
// on every request so logout/password changes cannot leave this client stale.
export function createChatApi({ baseUrl, getToken }) {
  const base = baseUrl.replace(/\/$/, '');
  async function request(path, method = 'GET', body, signal) {
    const token = await getToken();
    if (!token) throw new Error('Please sign in.');
    const multipart = body instanceof FormData;
    const response = await fetch(`${base}/api${path}`, {
      method, signal,
      headers: { Authorization: `Bearer ${token}`, ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? multipart ? body : JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`Server returned HTTP ${response.status} without a JSON response.`); }
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    // 207 is a valid response: callers MUST inspect summary.failed/results.
    return data;
  }
  const chatPath = (id) => `/chats/${encodeURIComponent(id)}`;

  async function sendAttachment(conversationId, asset, { kind, content = '', replyTo, waveform, signal } = {}) {
    if (!LIMIT_MB[kind]) throw new Error('Choose a supported attachment kind.');
    const file = new File(asset.uri);
    if (!file.exists) throw new Error('This attachment is no longer available. Please select it again.');
    if (file.size > LIMIT_MB[kind] * 1024 * 1024) throw new Error(`${kind} attachments must be at most ${LIMIT_MB[kind]} MB.`);
    const form = new FormData();
    form.append('kind', kind);
    form.append('content', content);
    if (replyTo) form.append('replyTo', replyTo);
    if (waveform?.length) form.append('waveform', JSON.stringify(waveform));
    const mime = asset.mimeType || file.type;
    // File implements Blob. Override its inferred type only if the picker supplies one.
    const blob = mime && mime !== file.type ? file.slice(0, file.size, mime) : file;
    form.append('media', blob, asset.name || file.name);
    // Do not manually set multipart Content-Type; fetch adds its boundary.
    return request(`${chatPath(conversationId)}/messages`, 'POST', form, signal);
  }

  return {
    sendAttachment,
    sendSticker: (id, asset, options = {}) => sendAttachment(id, asset, { ...options, kind: 'sticker' }),
    sendVoiceNote: (id, asset, options = {}) => sendAttachment(id, asset, { ...options, kind: 'audio' }),
    sendText: (id, content, replyTo) => request(`${chatPath(id)}/messages`, 'POST', { content, ...(replyTo ? { replyTo } : {}) }),
    getChat: (id) => request(chatPath(id)),
    pin: (id, messageId, duration) => request(`${chatPath(id)}/pinned-message`, 'PATCH', { messageId, duration }),
    unpin: (id) => request(`${chatPath(id)}/pinned-message`, 'PATCH', { messageId: null }),
    deleteSelected: (id, messageIds, scope = 'me') => request(`${chatPath(id)}/messages/bulk-delete`, 'POST', { messageIds, scope }),
    forwardSelected: (id, messageIds, targets) => request(`${chatPath(id)}/messages/bulk-forward`, 'POST', { messageIds, targets }),

    // Sparks (every chat, DMs included). Spark ids are opaque strings ("spk_...").
    listSparks: (id) => request(`${chatPath(id)}/sparks`),
    getSpark: (id, sparkId) => request(`${chatPath(id)}/sparks/${encodeURIComponent(sparkId)}`),
    getSparkMembers: (id) => request(`${chatPath(id)}/sparks/members`),
    startSpark: (id, messageId, subject, force = false) => request(`${chatPath(id)}/sparks`, 'POST', { messageId, subject, ...(force ? { force: true } : {}) }),
    addToSpark: (id, sparkId, messageId) => request(`${chatPath(id)}/sparks/${encodeURIComponent(sparkId)}/messages`, 'POST', { messageId }),
    sendInSpark: (id, sparkId, content, replyTo) => request(`${chatPath(id)}/messages`, 'POST', { content, sparkId, ...(replyTo ? { replyTo } : {}) }),
    pinSpark: (id, sparkId, pinned = true) => request(`${chatPath(id)}/sparks/${encodeURIComponent(sparkId)}/pin`, 'PATCH', { pinned }),
    deleteSpark: (id, sparkId) => request(`${chatPath(id)}/sparks/${encodeURIComponent(sparkId)}`, 'DELETE'),
    mergeSpark: (id, sparkId, intoSparkId) => request(`${chatPath(id)}/sparks/${encodeURIComponent(sparkId)}/merge`, 'POST', { intoSparkId }),
  };
}
