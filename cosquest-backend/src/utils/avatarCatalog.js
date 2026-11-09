const crypto = require('crypto');
const { AVATARS, AVATAR_KEYS } = require('../models/avatarModel');
const STATIC_PUBLIC_IDS = require('../data/cloudinaryAvatarPublicIds');
const { getCloudinary, cloudinaryImageUrl } = require('./cloudinary');

/**
 * The avatar picker's options. The 100 original avatars in avatarModel.js keep
 * their keys, labels and order; on top of that this asks Cloudinary what
 * actually exists, so avatars uploaded later show up without a code change and
 * avatars deleted from Cloudinary stop being offered (no broken images).
 *
 * Which Cloudinary images count as avatars:
 *   CLOUDINARY_AVATAR_TAG    - only images with this tag, or
 *   CLOUDINARY_AVATAR_PREFIX - only public IDs starting with this (e.g. "avatars/"), or
 *   neither                  - every image in the account except the app's own
 *                              upload folders (cosquest/profile-photos, posts, chat...).
 * CLOUDINARY_AVATAR_CACHE_SECONDS (default 600) controls how long a listing is
 * reused, because Cloudinary's Admin API is rate limited.
 *
 * If Cloudinary can't be reached or returns nothing, the last good listing (or
 * the built-in 100) is served instead - the picker never comes back empty.
 */

// The stock pictures every new Cloudinary account starts with.
const CLOUDINARY_DEMO_IMAGE = /^(main-)?sample$|^cld-sample(-\d+)?$/;

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

// Swapped out by the integration tests; real code never touches it.
const source = { list: listFromCloudinary };

let cache = null; // { avatars, at }
let inflight = null;

function ttlMs() {
  const seconds = Number(process.env.CLOUDINARY_AVATAR_CACHE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 600) * 1000;
}

function staticCatalog() {
  return AVATARS.map(({ key, label }, index) => ({
    key,
    label,
    publicId: STATIC_PUBLIC_IDS[index],
    imageUrl: cloudinaryImageUrl(STATIC_PUBLIC_IDS[index]),
  }));
}

function ownUploadPrefixes() {
  const folders = [
    'cosquest',
    process.env.CLOUDINARY_PROFILE_PHOTO_FOLDER,
    process.env.CLOUDINARY_POST_IMAGE_FOLDER,
    process.env.CLOUDINARY_REEL_FOLDER,
    process.env.CLOUDINARY_CHAT_FOLDER,
  ].filter(Boolean);
  return folders.map((folder) => `${folder.replace(/\/+$/, '')}/`);
}

async function listFromCloudinary() {
  if (process.env.NODE_ENV === 'test') return null;
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return null;
  const cloudinary = getCloudinary();
  if (!cloudinary) return null;

  const tag = process.env.CLOUDINARY_AVATAR_TAG;
  const prefix = process.env.CLOUDINARY_AVATAR_PREFIX;
  const found = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const options = { resource_type: 'image', max_results: PAGE_SIZE, context: true, ...(cursor ? { next_cursor: cursor } : {}) };
    const result = tag
      ? await cloudinary.api.resources_by_tag(tag, options)
      : await cloudinary.api.resources({ type: 'upload', ...(prefix ? { prefix } : {}), ...options });
    for (const resource of result.resources || []) {
      found.push({ publicId: resource.public_id, caption: resource.context?.custom?.caption || null });
    }
    cursor = result.next_cursor;
    if (!cursor) break;
  }

  if (tag || prefix) return found;
  const own = ownUploadPrefixes();
  return found.filter((item) => !own.some((folder) => item.publicId.startsWith(folder)) && !CLOUDINARY_DEMO_IMAGE.test(item.publicId));
}

// A stable key from the Cloudinary public ID: users store it forever, so it
// must not depend on list order or on other avatars being added or removed.
function keyForPublicId(publicId) {
  return `cl-${crypto.createHash('sha1').update(publicId).digest('hex').slice(0, 10)}`;
}

function buildCatalog(found) {
  const existing = new Set(found.map((item) => item.publicId));
  const known = new Set(STATIC_PUBLIC_IDS);
  const avatars = staticCatalog().filter((avatar) => existing.has(avatar.publicId));
  const added = found.filter((item) => !known.has(item.publicId)).sort((a, b) => a.publicId.localeCompare(b.publicId));
  for (const item of added) {
    avatars.push({
      key: keyForPublicId(item.publicId),
      label: item.caption || `Avatar ${avatars.length + 1}`,
      publicId: item.publicId,
      imageUrl: cloudinaryImageUrl(item.publicId),
    });
  }
  return avatars;
}

async function refresh() {
  try {
    const found = await source.list();
    if (found === null) {
      cache = { avatars: staticCatalog(), at: Date.now() };
      return cache.avatars;
    }
    if (found.length) {
      cache = { avatars: buildCatalog(found), at: Date.now() };
      return cache.avatars;
    }
    console.error('[avatars] Cloudinary returned no avatars; keeping the previous list.');
  } catch (error) {
    console.error('[avatars] Cloudinary listing failed; keeping the previous list:', error.message);
  }
  // Back off briefly instead of hitting a failing API on every request.
  const avatars = cache?.avatars || staticCatalog();
  cache = { avatars, at: Date.now() - Math.max(0, ttlMs() - RETRY_AFTER_FAILURE_MS) };
  return avatars;
}

async function getAvatarCatalog() {
  if (cache && Date.now() - cache.at < ttlMs()) return cache.avatars;
  if (!inflight) inflight = refresh().finally(() => { inflight = null; });
  return inflight;
}

// The built-in keys always stay valid (existing users already have them saved);
// Cloudinary-discovered keys are valid while their image still exists.
async function isValidAvatarKey(key) {
  if (typeof key !== 'string') return false;
  if (AVATAR_KEYS.includes(key)) return true;
  if (!key.startsWith('cl-')) return false;
  return (await getAvatarCatalog()).some((avatar) => avatar.key === key);
}

async function avatarImageUrl(key) {
  const index = AVATAR_KEYS.indexOf(key);
  if (index !== -1) return cloudinaryImageUrl(STATIC_PUBLIC_IDS[index]);
  const match = (await getAvatarCatalog()).find((avatar) => avatar.key === key);
  return match ? match.imageUrl : null;
}

function resetForTests({ expireOnly = false } = {}) {
  if (expireOnly && cache) cache.at = 0;
  else cache = null;
  inflight = null;
}

module.exports = { getAvatarCatalog, isValidAvatarKey, avatarImageUrl, keyForPublicId, source, resetForTests };
