const userModel = require('../models/userModel');
const { getFaction } = require('../models/factionModel');
const { avatarImageUrl } = require('../utils/avatarCatalog');
const { statsFor, canViewProfile } = require('./publicProfileController');

// PUBLIC_PROFILE_BASE_URL lets a separate marketing/web frontend host these
// links instead, later. Until then, this backend's own /u/:username page
// (below) is a fully working shareable link out of the box.
function profileBaseUrl(req) {
  const configured = process.env.PUBLIC_PROFILE_BASE_URL;
  const base = configured || `${req.protocol}://${req.get('host')}/u`;
  return base.replace(/\/$/, '');
}

async function resolveAvatarImageUrl(user) {
  if (user.profile.avatarPhotoUrl) return user.profile.avatarPhotoUrl;
  return avatarImageUrl(user.profile.avatarKey);
}

async function buildShareData(user, req) {
  const name = user.profile.displayName || [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ') || user.profile.username;
  const faction = getFaction(user.faction);
  const bio = user.profile.bio || (faction ? `${faction.name} · CosQuest member` : 'CosQuest member');
  return {
    url: `${profileBaseUrl(req)}/${encodeURIComponent(user.profile.username)}`,
    title: `${name} (@${user.profile.username}) on CosQuest`,
    text: `Check out ${name}'s profile on CosQuest!`,
    bio,
    imageUrl: await resolveAvatarImageUrl(user),
    name,
    username: user.profile.username,
    faction,
  };
}

// GET /api/users/:username/share - Public. A ready-made payload for the
// frontend's native share sheet (Share.share() on mobile, navigator.share()
// on web) - the link format lives here once, not hardcoded on the frontend.
async function getProfileShareLink(req, res) {
  const user = await userModel.findByUsername(req.params.username);
  if (!user || !(await canViewProfile(user, req.userId))) return res.status(404).json({ error: 'Profile not found.' });
  const { url, title, text } = await buildShareData(user, req);
  return res.json({ url, title, text });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function notFoundHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><title>Profile not found - CosQuest</title></head>'
    + '<body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px;color:#444;">'
    + '<h1>Profile not found</h1><p>This CosQuest profile doesn’t exist or may have been removed.</p></body></html>';
}

function profileHtml(share, stats) {
  const { url, title, text, bio, imageUrl, name, username, faction } = share;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(bio)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(bio)}">
<meta property="og:url" content="${escapeHtml(url)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(bio)}">
${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: linear-gradient(180deg,#fce4ec,#e1f5fe); margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
  .card { background: #fff; border-radius: 24px; padding: 32px 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,0.08); }
  img.avatar { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #ec4899; }
  h1 { font-size: 22px; margin: 16px 0 2px; }
  .username { color: #888; margin: 0 0 12px; }
  .bio { color: #444; line-height: 1.5; }
  .stats { display: flex; justify-content: center; gap: 24px; margin: 20px 0; }
  .stats div { font-size: 13px; color: #888; }
  .stats strong { display: block; font-size: 18px; color: #111; }
</style>
</head>
<body>
  <div class="card">
    ${imageUrl ? `<img class="avatar" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}">` : ''}
    <h1>${escapeHtml(name)}</h1>
    <p class="username">@${escapeHtml(username)}${faction ? ` · ${escapeHtml(faction.name)}` : ''}</p>
    ${bio ? `<p class="bio">${escapeHtml(bio)}</p>` : ''}
    <div class="stats">
      <div><strong>${stats.followers}</strong>Followers</div>
      <div><strong>${stats.posts}</strong>Posts</div>
      <div><strong>${stats.points}</strong>Points</div>
    </div>
  </div>
</body>
</html>`;
}

// GET /u/:username - Public, plain HTML (not JSON). This is the actual link
// shared to Instagram/Facebook/etc.: social crawlers need a real HTML page
// with Open Graph tags to render a rich preview - a JSON response can't do
// that. Anyone without the app still sees a readable profile card here.
async function renderPublicProfilePage(req, res) {
  const user = await userModel.findByUsername(req.params.username);
  if (!user || !(await canViewProfile(user, req.userId))) return res.status(404).type('html').send(notFoundHtml());

  const [stats, share] = await Promise.all([statsFor(user), buildShareData(user, req)]);
  return res.type('html').send(profileHtml(share, stats));
}

module.exports = { getProfileShareLink, renderPublicProfilePage };
