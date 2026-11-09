const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    // Not user-id-prefixed on purpose: multer has to parse the multipart body
    // (to find the email field, for pre-login callers) before identifyUser
    // runs, so req.userId isn't set yet at this point in the route chain.
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

// A rejected file type is the caller's mistake, not a server failure -
// errorHandler.js defaults to 500 unless the error carries its own status.
function invalidFileType(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// 'image/jpg' isn't a real registered MIME type (the correct one is
// 'image/jpeg'), but several real clients - including some Postman/OS
// combinations - send it anyway for a plain .jpg file. Accepting both means
// a genuinely valid JPEG is never rejected over which spelling a client used.
// 'application/octet-stream' is the generic "I couldn't determine the type"
// fallback some clients send when they fail to detect a file's type at all,
// and 'text/plain' shows up when a mobile picker mislabels a real image
// asset's type - both are a real file part (it has a filename, which is why
// it even reaches this filter at all), just tagged wrong. Letting these
// through defers to Cloudinary's real content-based validation (see
// imageHost.js) instead of trusting a client's incorrect label.
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream', 'text/plain'];
const POST_MEDIA_TYPES = [...ALLOWED_TYPES, 'video/mp4', 'video/quicktime', 'video/webm'];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(invalidFileType(`Only JPEG, PNG, WEBP, or GIF images are allowed (received "${file.mimetype}").`));
    }
    cb(null, true);
  },
});

// Posts use the same temporary upload folder, then move to Cloudinary. The
// controller applies the stricter per-post rules (1-8 images or 1 short reel).
const postUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (!POST_MEDIA_TYPES.includes(file.mimetype)) {
      return cb(invalidFileType(`Post media must be JPEG, PNG, WEBP, GIF, MP4, MOV, or WEBM (received "${file.mimetype}").`));
    }
    cb(null, true);
  },
});

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'];
const CHAT_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const DOCUMENT_TYPES = [
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const CHAT_MEDIA_TYPES = [...ALLOWED_TYPES, ...AUDIO_TYPES, ...DOCUMENT_TYPES, ...CHAT_VIDEO_TYPES];

// The controller applies 1 MB stickers, 10 MB images/audio/documents, 50 MB videos.
const chatUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!CHAT_MEDIA_TYPES.includes(file.mimetype)) {
      return cb(invalidFileType('Chat attachments must be an image, MP4/MOV/WEBM video, audio, PDF, text, CSV, or Office document.'));
    }
    cb(null, true);
  },
});

// Albums: up to 10 photos/videos in one message. chatUpload above only ever
// accepts a single file, so albums need their own limits.
const ALBUM_TYPES = [...ALLOWED_TYPES.filter((type) => type.startsWith('image/')), ...CHAT_VIDEO_TYPES];
const albumUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALBUM_TYPES.includes(file.mimetype)) {
      return cb(invalidFileType('Albums can only contain photos (JPEG, PNG, WEBP, GIF) and videos (MP4, MOV, WEBM).'));
    }
    cb(null, true);
  },
});

module.exports = { upload, postUpload, chatUpload, albumUpload, uploadDir, DOCUMENT_TYPES };
