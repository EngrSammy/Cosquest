const mongoose = require('mongoose');
const Post = require('../models/Post');
const { canViewProfile, canViewActivityFeed } = require('./publicProfileController');
const { buildContentShare, shareHtml, appLink } = require('../utils/shareLinks');

async function publicPostShare(req) {
  if (!mongoose.isValidObjectId(req.params.postId)) return null;
  const post = await Post.findById(req.params.postId).populate('author');
  // Public previews must never contain private profile content, even when requested by the owner.
  if (!post?.author || !(await canViewProfile(post.author)) || !(await canViewActivityFeed(post.author))) return null;
  const name = post.author.profile.displayName || post.author.profile.username;
  const path = `/p/${post.id}`;
  return {
    ...buildContentShare(req, path, `${name} on CosQuest`, post.content || 'View this post on CosQuest.'),
    imageUrl: post.type === 'image' ? post.media[0]?.url : null,
    appUrl: appLink(`/posts/${post.id}`),
  };
}

async function getPostShareLink(req, res) {
  const data = await publicPostShare(req);
  if (!data) return res.status(404).json({ error: 'Post not found.' });
  return res.json(data);
}

async function renderPostShare(req, res) {
  const data = await publicPostShare(req);
  if (!data) return res.status(404).type('text').send('Post not found.');
  return res.type('html').send(shareHtml(data));
}

function renderChatShare(req, res) {
  const { conversationId, messageId } = req.params;
  if (!mongoose.isValidObjectId(conversationId) || (messageId && !mongoose.isValidObjectId(messageId))) {
    return res.status(404).type('text').send('Link not found.');
  }
  const path = `/c/${conversationId}${messageId ? `/m/${messageId}` : ''}`;
  // Public crawlers get only a generic card; the app resolves the IDs through authenticated APIs.
  const data = buildContentShare(req, path, 'CosQuest chat', 'Sign in to CosQuest to open this chat. Only conversation members can view its messages.');
  res.set('Cache-Control', 'no-store');
  return res.type('html').send(shareHtml({ ...data, appUrl: appLink(`/chats/${conversationId}${messageId ? `/messages/${messageId}` : ''}`) }));
}

module.exports = { getPostShareLink, renderPostShare, renderChatShare };
