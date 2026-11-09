const { DOCUMENT_TYPES } = require('../middleware/upload');
const MB = 1024 * 1024;
const LIMITS = { image: 10 * MB, audio: 10 * MB, file: 10 * MB, video: 50 * MB, sticker: MB };

function validateChatMedia(file, body) {
  const inferred = file ? file.mimetype.startsWith('audio/') ? 'audio'
    : file.mimetype.startsWith('video/') ? 'video'
    : DOCUMENT_TYPES.includes(file.mimetype) ? 'file' : 'image' : 'text';
  const kind = body.kind === undefined ? inferred : body.kind;
  if (!['text', ...Object.keys(LIMITS)].includes(kind)) return { error: 'kind must be text, image, video, audio, file, or sticker.', status: 400 };
  if (kind === 'sticker') {
    if (!file || !['image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return { error: 'A sticker requires a PNG, WEBP, or GIF media file.', status: 400 };
  } else if (kind !== inferred) {
    return { error: 'kind must match the uploaded media type.', status: 400 };
  }
  if (file && file.size > LIMITS[kind]) return { error: `${kind} attachments must be at most ${LIMITS[kind] / MB} MB.`, status: 413 };
  let waveform;
  if (body.waveform !== undefined) {
    try { waveform = typeof body.waveform === 'string' ? JSON.parse(body.waveform) : body.waveform; } catch { return { error: 'waveform must be a JSON array.', status: 400 }; }
    if (kind !== 'audio' || !Array.isArray(waveform) || waveform.length < 1 || waveform.length > 128 || waveform.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) {
      return { error: 'Audio waveform must contain 1-128 numbers from 0 to 1.', status: 400 };
    }
  }
  return { kind, waveform };
}

module.exports = { validateChatMedia };
