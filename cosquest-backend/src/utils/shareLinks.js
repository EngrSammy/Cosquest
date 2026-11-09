function buildContentShare(req, path, title, text) {
  const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return { url: `${base}${path}`, title, text };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function shareHtml({ url, title, text, imageUrl, appUrl }) {
  const e = escapeHtml;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(text)}"><meta property="og:url" content="${e(url)}">
${imageUrl ? `<meta property="og:image" content="${e(imageUrl)}">` : ''}
<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
</head><body><main><h1>${e(title)}</h1><p>${e(text)}</p>
${imageUrl ? `<img src="${e(imageUrl)}" alt="Post image" style="max-width:100%;height:auto">` : ''}
${appUrl ? `<p><a href="${e(appUrl)}">Open in CosQuest</a></p>` : ''}
</main></body></html>`;
}

function appLink(path) {
  if (!process.env.APP_WEB_URL) return null;
  const url = new URL(process.env.APP_WEB_URL);
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${path}`;
}

module.exports = { buildContentShare, shareHtml, appLink };
