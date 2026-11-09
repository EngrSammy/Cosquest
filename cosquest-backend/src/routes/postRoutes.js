const express = require('express');
const { requireAuth, optionalAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { postUpload, chatUpload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const { getPostShareLink } = require('../controllers/contentShareController');
const {
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
} = require('../controllers/postController');

const router = express.Router();

router.get('/posts', asyncHandler(listPosts));
router.post('/posts', requireAuth, requireCompletedOnboarding, postUpload.array('media', 8), asyncHandler(createPost));
router.get('/posts/:postId', asyncHandler(getPost));
router.get('/posts/:postId/share', asyncHandler(getPostShareLink));
router.patch('/posts/:postId', requireAuth, requireCompletedOnboarding, asyncHandler(updatePost));
router.delete('/posts/:postId', requireAuth, requireCompletedOnboarding, asyncHandler(deletePost));
router.post('/posts/:postId/likes', requireAuth, requireCompletedOnboarding, asyncHandler(likePost));
router.delete('/posts/:postId/likes', requireAuth, requireCompletedOnboarding, asyncHandler(unlikePost));
router.post('/posts/:postId/shares', requireAuth, requireCompletedOnboarding, asyncHandler(sharePost));
router.delete('/posts/:postId/shares', requireAuth, requireCompletedOnboarding, asyncHandler(unsharePost));
// Share a post into your feed (like Facebook's "Share now"), with an
// optional caption: body { content? }.
router.post('/posts/:postId/share-to-feed', requireAuth, requireCompletedOnboarding, asyncHandler(shareToFeed));
router.post('/posts/:postId/bookmarks', requireAuth, requireCompletedOnboarding, asyncHandler(bookmarkPost));
router.delete('/posts/:postId/bookmarks', requireAuth, requireCompletedOnboarding, asyncHandler(unbookmarkPost));
router.get('/users/me/bookmarks', requireAuth, requireCompletedOnboarding, asyncHandler(listMyBookmarks));
router.get('/posts/:postId/comments', asyncHandler(optionalAuth), asyncHandler(listComments));
router.post('/posts/:postId/comments', requireAuth, requireCompletedOnboarding, chatUpload.single('media'), asyncHandler(createComment));
router.delete('/posts/:postId/comments/:commentId', requireAuth, requireCompletedOnboarding, asyncHandler(deleteComment));
router.post('/posts/:postId/comments/:commentId/likes', requireAuth, requireCompletedOnboarding, asyncHandler(setCommentLike));
router.delete('/posts/:postId/comments/:commentId/likes', requireAuth, requireCompletedOnboarding, asyncHandler(setCommentLike));
router.get('/users/:username/posts', asyncHandler(optionalAuth), asyncHandler(listUserPosts));

module.exports = router;
