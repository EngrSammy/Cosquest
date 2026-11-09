const fs = require('fs');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const PostLike = require('../models/PostLike');
const PostComment = require('../models/PostComment');
const CommentLike = require('../models/CommentLike');
const PostShare = require('../models/PostShare');
const PostBookmark = require('../models/PostBookmark');
const userModel = require('../models/userModel');
const { storePostMedia, deletePostMedia, storeChatMedia } = require('../utils/imageHost');
const { transcribeAudio } = require('../utils/transcribeAudio');
const { canViewProfile, canViewActivityFeed, isBlockedEitherWay } = require('./publicProfileController');
// NEW — same emitter module chat's controller already uses, just the
// post:<id> room instead of conversation:<id>. No circular-require risk
// here the way chatController<->socket.js has: socket.js's initSocket
// only ever lazily requires chatController, never postController, so
// this can be a normal top-level require.
const { emitToPost } = require('../realtime/socket');

// Types a person can CREATE with POST /api/posts.
const POST_TYPES = ['image', 'reel', 'thought'];
// Types that can appear in lists ('share' = a shared post, created with
// POST /api/posts/:postId/share-to-feed).
const LIST_TYPES = [...POST_TYPES, 'share'];
// 'image/jpg' isn't a registered MIME type, and 'application/octet-stream'/
// 'text/plain' are mislabeled-but-real files (a mobile picker guessing
// wrong) - all accepted here the same way as upload.js's ALLOWED_TYPES,
// deferring real validation to Cloudinary.
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream', 'text/plain'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'application/octet-stream', 'text/plain'];

const AUTHOR_FIELDS = 'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction';

// A shared post's original, with its author (used by every list).
const SHARED_POST_POPULATE = { path: 'sharedPost', populate: { path: 'author', select: AUTHOR_FIELDS } };

function parseLimit(value, fallback = 20) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : fallback;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
}

function cleanUpLocalFiles(files) {
  for (const file of files || []) {
    if (file?.path) fs.unlink(file.path, () => {});
  }
}

function authorPreview(author) {
  return {
    id: String(author._id),
    username: author.profile.username,
    name: author.profile.displayName || [author.profile.firstName, author.profile.lastName].filter(Boolean).join(' ') || author.profile.username,
    avatarKey: author.profile.avatarKey,
    avatarPhotoUrl: author.profile.avatarPhotoUrl,
    faction: author.faction,
  };
}

// The original post inside a shared post. `{ unavailable: true }` when the
// original was deleted.
function serializeSharedPost(item) {
  if (item.type !== 'share') return null;
  const original = item.sharedPost;
  if (!original || !original._id) return { unavailable: true };
  return {
    id: String(original._id),
    type: original.type,
    content: original.content,
    media: original.media,
    likeCount: original.likeCount,
    commentCount: original.commentCount,
    shareCount: original.shareCount,
    createdAt: original.createdAt,
    author: original.author?.profile ? authorPreview(original.author) : undefined,
  };
}

function serializePost(post) {
  const item = post.toObject ? post.toObject() : post;
  return {
    id: String(item._id),
    type: item.type,
    content: item.content,
    media: item.media,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    shareCount: item.shareCount,
    bookmarkCount: item.bookmarkCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    editedAt: item.editedAt || null,
    author: item.author?.profile ? authorPreview(item.author) : undefined,
    // For type 'share': the original post (or { unavailable: true }).
    sharedPost: serializeSharedPost(item),
  };
}

function validatePostInput(type, content, files) {
  if (!POST_TYPES.includes(type)) return 'type must be image, reel, or thought.';
  if (typeof content !== 'string') return 'content must be text.';
  if (type === 'thought' && (!content.trim() || content.trim().length > 300)) {
    return 'A thought must contain 1 to 300 characters.';
  }
  if (type !== 'thought' && content.trim().length > 2200) return 'Post captions must be at most 2,200 characters.';
  if (type === 'thought' && files.length) return 'Thoughts cannot include media.';
  if (type === 'image') {
    if (files.length < 1 || files.length > 8) return 'An image post must contain between 1 and 8 images.';
    if (files.some((file) => !IMAGE_TYPES.includes(file.mimetype) || file.size > 10 * 1024 * 1024)) {
      return 'Each post image must be JPEG, PNG, WEBP, or GIF and no larger than 10MB.';
    }
  }
  if (type === 'reel') {
    if (files.length !== 1 || !VIDEO_TYPES.includes(files[0].mimetype)) {
      return 'A reel must contain exactly one MP4, MOV, or WEBM video.';
    }
  }
  return null;
}

async function loadPost(postId) {
  if (!mongoose.isValidObjectId(postId)) return null;
  return Post.findById(postId)
    .populate('author', AUTHOR_FIELDS)
    .populate(SHARED_POST_POPULATE);
}

async function createPost(req, res) {
  const type = String(req.body.type || '').trim().toLowerCase();
  const content = req.body.content === undefined ? '' : req.body.content;
  const files = req.files || [];
  const validationError = validatePostInput(type, content, files);
  if (validationError) {
    cleanUpLocalFiles(files);
    return res.status(400).json({ error: validationError });
  }

  let media = [];
  try {
    if (files.length) media = await storePostMedia(files, type);
    if (type === 'reel' && Number(media[0].durationSeconds) > 30) {
      await deletePostMedia(media);
      return res.status(400).json({ error: 'A reel must be 30 seconds or shorter.' });
    }
    const post = await Post.create({ author: req.userId, type, content: content.trim(), media });
    await post.populate('author', AUTHOR_FIELDS);
    return res.status(201).json({ post: serializePost(post) });
  } catch (error) {
    if (media.length) await deletePostMedia(media);
    throw error;
  }
}

async function listPosts(req, res) {
  const type = req.query.type;
  if (type && !LIST_TYPES.includes(type)) return res.status(400).json({ error: 'type must be image, reel, thought, or share.' });
  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const query = type ? { type } : {};
  const [posts, total] = await Promise.all([
    Post.find(query)
      .populate('author', AUTHOR_FIELDS)
      .populate(SHARED_POST_POPULATE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Post.countDocuments(query),
  ]);
  return res.json({ posts: posts.map(serializePost), pagination: { page, limit, total, hasMore: page * limit < total } });
}

async function listUserPosts(req, res) {
  const user = await userModel.findByUsername(req.params.username);
  if (!user || !(await canViewProfile(user, req.userId))) return res.status(404).json({ error: 'Profile not found.' });
  const type = req.query.type;
  if (type && !LIST_TYPES.includes(type)) return res.status(400).json({ error: 'type must be image, reel, thought, or share.' });
  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  // The profile itself is visible, but "Show Activity Feed" being off hides
  // the posts specifically from anyone who isn't the owner or a friend - an
  // empty list, not a 404, since the profile really is there.
  if (!(await canViewActivityFeed(user, req.userId))) {
    return res.json({ posts: [], pagination: { page, limit, total: 0, hasMore: false } });
  }
  const query = { author: user._id, ...(type ? { type } : {}) };
  const [posts, total] = await Promise.all([
    Post.find(query)
      .populate('author', AUTHOR_FIELDS)
      .populate(SHARED_POST_POPULATE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Post.countDocuments(query),
  ]);
  return res.json({ posts: posts.map(serializePost), pagination: { page, limit, total, hasMore: page * limit < total } });
}

async function getPost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ post: serializePost(post) });
}

async function updatePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (String(post.author._id) !== String(req.userId)) return res.status(403).json({ error: 'You can only edit your own post.' });
  if (req.body.content === undefined || typeof req.body.content !== 'string') {
    return res.status(400).json({ error: 'content is required.' });
  }
  const content = req.body.content.trim();
  const maxLength = post.type === 'thought' ? 300 : 2200;
  if ((post.type === 'thought' && !content) || content.length > maxLength) {
    return res.status(400).json({ error: `content must be ${post.type === 'thought' ? '1 to 300' : 'at most 2,200'} characters.` });
  }
  post.content = content;
  post.editedAt = new Date();
  await post.save();
  return res.json({ post: serializePost(post) });
}

async function deletePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (String(post.author._id) !== String(req.userId)) return res.status(403).json({ error: 'You can only delete your own post.' });
  await Promise.all([
    PostLike.deleteMany({ post: post._id }),
    CommentLike.deleteMany({ post: post._id }),
    PostComment.deleteMany({ post: post._id }),
    PostShare.deleteMany({ post: post._id }),
    PostBookmark.deleteMany({ post: post._id }),
    Post.deleteOne({ _id: post._id }),
  ]);
  await deletePostMedia(post.media);

  // Deleting your shared post takes your share back off the original.
  if (post.type === 'share' && post.sharedPost?._id) {
    const removed = await PostShare.deleteOne({ post: post.sharedPost._id, user: req.userId });
    if (removed.deletedCount) {
      await Post.updateOne({ _id: post.sharedPost._id, shareCount: { $gt: 0 } }, { $inc: { shareCount: -1 } });
    }
  }

  return res.json({ message: 'Post deleted.' });
}

async function likePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  try {
    await PostLike.create({ post: post._id, user: req.userId });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already liked this post.' });
    throw error;
  }
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { likeCount: 1 } }, { new: true });
  return res.status(201).json({ liked: true, likeCount: updated.likeCount });
}

async function unlikePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const removed = await PostLike.deleteOne({ post: post._id, user: req.userId });
  if (!removed.deletedCount) return res.status(404).json({ error: 'You have not liked this post.' });
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { likeCount: -1 } }, { new: true });
  return res.json({ liked: false, likeCount: Math.max(0, updated.likeCount) });
}

async function sharePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  try {
    await PostShare.create({ post: post._id, user: req.userId });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already shared this post.' });
    throw error;
  }
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { shareCount: 1 } }, { new: true });
  return res.status(201).json({ shared: true, shareCount: updated.shareCount });
}

// POST /api/posts/:postId/share-to-feed  { content? }
// Creates a 'share' post in the feed that shows the ORIGINAL post inside it
// (sharing a share shares its original). The original's shareCount goes up
// once per person - same rule as POST /posts/:postId/shares.
async function shareToFeed(req, res) {
  const target = await loadPost(req.params.postId);
  if (!target) return res.status(404).json({ error: 'Post not found.' });

  // Always point at the original, never at another share.
  const original = target.type === 'share' ? target.sharedPost : target;
  if (!original || !original._id) {
    return res.status(404).json({ error: 'This post is no longer available.' });
  }

  const originalAuthorId = original.author?._id || original.author;
  if (await isBlockedEitherWay(req.userId, originalAuthorId)) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (content.length > 2200) return res.status(400).json({ error: 'Your caption must be at most 2,200 characters.' });

  const post = await Post.create({ author: req.userId, type: 'share', content, sharedPost: original._id });

  // Count the share on the original (once per person).
  let shareCount = original.shareCount || 0;
  try {
    await PostShare.create({ post: original._id, user: req.userId });
    const updated = await Post.findByIdAndUpdate(original._id, { $inc: { shareCount: 1 } }, { new: true });
    shareCount = updated?.shareCount ?? shareCount;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  await post.populate('author', AUTHOR_FIELDS);
  await post.populate(SHARED_POST_POPULATE);
  return res.status(201).json({ post: serializePost(post), originalPostId: String(original._id), shareCount });
}

async function unsharePost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const removed = await PostShare.deleteOne({ post: post._id, user: req.userId });
  if (!removed.deletedCount) return res.status(404).json({ error: 'You have not shared this post.' });
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { shareCount: -1 } }, { new: true });
  return res.json({ shared: false, shareCount: Math.max(0, updated.shareCount) });
}

async function bookmarkPost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  try {
    await PostBookmark.create({ post: post._id, user: req.userId });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already bookmarked this post.' });
    throw error;
  }
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { bookmarkCount: 1 } }, { new: true });
  return res.status(201).json({ bookmarked: true, bookmarkCount: updated.bookmarkCount });
}

async function unbookmarkPost(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const removed = await PostBookmark.deleteOne({ post: post._id, user: req.userId });
  if (!removed.deletedCount) return res.status(404).json({ error: 'You have not bookmarked this post.' });
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { bookmarkCount: -1 } }, { new: true });
  return res.json({ bookmarked: false, bookmarkCount: Math.max(0, updated.bookmarkCount) });
}

async function listMyBookmarks(req, res) {
  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const query = { user: req.userId };
  const [bookmarks, total] = await Promise.all([
    PostBookmark.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: 'post',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          SHARED_POST_POPULATE,
        ],
      }),
    PostBookmark.countDocuments(query),
  ]);
  return res.json({
    posts: bookmarks.filter((bookmark) => bookmark.post).map((bookmark) => serializePost(bookmark.post)),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

function serializeComment(comment, likes = { count: 0, mine: false }) {
  return {
    id: String(comment._id),
    body: comment.body,
    media: comment.media || null,
    author: authorPreview(comment.author),
    parentComment: comment.parentComment ? String(comment.parentComment) : null,
    replyCount: comment.replyCount || 0,
    replyToComment: comment.replyToComment ? String(comment.replyToComment) : null,
    likeCount: likes.count,
    likedByMe: likes.mine,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

// GET /api/posts/:postId/comments - top-level comments by default; pass
// ?parentComment=<id> to fetch the replies under one specific top-level
// comment instead. A reply id resolves to its root thread as well.
async function listComments(req, res) {
  const post = await loadPost(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  let parentComment = null;
  if (req.query.parentComment) {
    if (!mongoose.isValidObjectId(req.query.parentComment)) return res.status(404).json({ error: 'Comment not found.' });
    const parent = await PostComment.findById(req.query.parentComment);
    if (!parent || String(parent.post) !== String(post._id)) return res.status(404).json({ error: 'Comment not found.' });
    parentComment = parent.parentComment || parent._id;
  }

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const query = { post: post._id, parentComment };
  const [comments, total] = await Promise.all([
    PostComment.find(query)
      .populate('author', AUTHOR_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    PostComment.countDocuments(query),
  ]);
  const likes = await CommentLike.aggregate([
    { $match: { comment: { $in: comments.map((comment) => comment._id) } } },
    { $group: { _id: '$comment', count: { $sum: 1 }, mine: { $max: { $cond: [{ $eq: ['$user', req.userId ? new mongoose.Types.ObjectId(req.userId) : null] }, 1, 0] } } } },
  ]);
  const likesByComment = new Map(likes.map((like) => [String(like._id), { count: like.count, mine: Boolean(like.mine) }]));
  return res.json({
    comments: comments.map((comment) => serializeComment(comment, likesByComment.get(String(comment._id)))),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// POST /api/posts/:postId/comments - pass parentComment to reply under an
// existing comment or reply. Store every reply under the root thread. A
// comment needs body text, a voice attachment, or both.
async function createComment(req, res) {
  const file = req.file || null;
  const post = await loadPost(req.params.postId);
  if (!post) {
    cleanUpLocalFiles(file ? [file] : []);
    return res.status(404).json({ error: 'Post not found.' });
  }
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body && !file) {
    return res.status(400).json({ error: 'A comment needs text or a voice attachment.' });
  }
  if (body.length > 500) {
    cleanUpLocalFiles(file ? [file] : []);
    return res.status(400).json({ error: 'A comment must be at most 500 characters.' });
  }
  if (file && !file.mimetype.startsWith('audio/')) {
    cleanUpLocalFiles([file]);
    return res.status(400).json({ error: 'A comment attachment must be an audio recording.' });
  }
  if (file && file.size > 10 * 1024 * 1024) {
    cleanUpLocalFiles([file]);
    return res.status(413).json({ error: 'Voice comments must be at most 10 MB.' });
  }

  let parent = null;
  if (req.body.parentComment) {
    if (!mongoose.isValidObjectId(req.body.parentComment)) {
      cleanUpLocalFiles(file ? [file] : []);
      return res.status(404).json({ error: 'Comment not found.' });
    }
    parent = await PostComment.findById(req.body.parentComment);
    if (!parent || String(parent.post) !== String(post._id)) {
      cleanUpLocalFiles(file ? [file] : []);
      return res.status(404).json({ error: 'Comment not found.' });
    }
  }

  let media = null;
  if (file) {
    media = await storeChatMedia(file, 'audio');
    media.transcribing = true;
  }

  const rootId = parent ? parent.parentComment || parent._id : null;
  const comment = await PostComment.create({ post: post._id, author: req.userId, body, media, parentComment: rootId, replyToComment: parent?._id || null });
  const [updated] = await Promise.all([
    Post.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } }, { new: true }),
    rootId ? PostComment.updateOne({ _id: rootId }, { $inc: { replyCount: 1 } }) : Promise.resolve(),
  ]);
  await comment.populate('author', AUTHOR_FIELDS);

  // Fire-and-forget, same as chat's voice notes - nobody waits on Deepgram
  // before their voice comment finishes posting.
  if (media?.url) {
    transcribeAndSaveComment(comment._id, media.url).catch((err) => {
      console.error('Comment voice transcription failed:', err);
    });
  }

  return res.status(201).json({
    comment: serializeComment(comment),
    commentCount: updated.commentCount,
  });
}

// Runs independently of the create response. Posts have no realtime layer
// (unlike chat), so the transcript simply lands on the comment for the next
// GET /api/posts/:postId/comments - no socket broadcast to wire up.
async function transcribeAndSaveComment(commentId, audioUrl) {
  let transcript = '';
  try {
    transcript = await transcribeAudio(audioUrl);
  } catch (err) {
    console.error('Deepgram transcription request failed:', err);
  }
  await PostComment.findOneAndUpdate(
    { _id: commentId, 'media.url': audioUrl },
    { $set: { 'media.transcript': transcript || null, 'media.transcribing': false } }
  );
}

// Deleting a top-level comment cascades to its replies (they can't exist without it).
async function deleteComment(req, res) {
  if (!mongoose.isValidObjectId(req.params.commentId)) return res.status(404).json({ error: 'Comment not found.' });
  const comment = await PostComment.findById(req.params.commentId);
  if (!comment || String(comment.post) !== String(req.params.postId)) return res.status(404).json({ error: 'Comment not found.' });
  if (String(comment.author) !== String(req.userId)) return res.status(403).json({ error: 'You can only delete your own comment.' });

  const query = comment.parentComment ? { _id: comment._id } : { $or: [{ _id: comment._id }, { parentComment: comment._id }] };
  const removedComments = await PostComment.find(query).select('_id media');
  const removedIds = removedComments.map((item) => item._id);
  const removed = await PostComment.deleteMany(query);
  await CommentLike.deleteMany({ comment: { $in: removedIds } });
  const removedMedia = removedComments.filter((item) => item.media).map((item) => item.media);
  if (removedMedia.length) await deletePostMedia(removedMedia);
  if (comment.parentComment) {
    await PostComment.updateOne({ _id: comment.parentComment }, { $inc: { replyCount: -1 } });
  }
  const removedCount = removed.deletedCount;
  const updated = await Post.findByIdAndUpdate(comment.post, { $inc: { commentCount: -removedCount } }, { new: true });
  return res.json({ message: 'Comment deleted.', commentCount: Math.max(0, updated?.commentCount || 0) });
}

async function setCommentLike(req, res) {
  if (!mongoose.isValidObjectId(req.params.commentId) || !mongoose.isValidObjectId(req.params.postId)) {
    return res.status(404).json({ error: 'Comment not found.' });
  }
  const comment = await PostComment.findOne({ _id: req.params.commentId, post: req.params.postId });
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  const query = { comment: comment._id, user: req.userId };
  const liked = req.method === 'POST';
  if (liked) {
    try {
      await CommentLike.updateOne(query, { $setOnInsert: { post: comment.post } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  } else {
    await CommentLike.deleteOne(query);
  }
  return res.json({ liked, likeCount: await CommentLike.countDocuments({ comment: comment._id }) });
}

module.exports = {
  createPost,
  listPosts,
  listUserPosts,
  getPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  sharePost,
  shareToFeed,
  unsharePost,
  bookmarkPost,
  unbookmarkPost,
  listMyBookmarks,
  listComments,
  createComment,
  deleteComment,
  setCommentLike,
};
