import {
  addComment,
  bookmarkPost,
  createImagePost,
  createPost,
  createReelPost,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  getPosts,
  likeComment,
  likePost,
  removeBookmark,
  sharePost,
  unlikeComment,
  unlikePost,
  updatePost,
} from "@/services/posts";

import { createAsyncThunk } from "@reduxjs/toolkit";

/* =========================================================
   FETCH POSTS
========================================================= */

export const fetchPosts = createAsyncThunk(
  "post/fetchPosts",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getPosts(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load posts",
      );
    }
  },
);

/* =========================================================
   CREATE THOUGHT
========================================================= */

export const createNewPost = createAsyncThunk(
  "post/createNewPost",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: {
        type: "thought";
        content: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await createPost(token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create post",
      );
    }
  },
);

/* =========================================================
   CREATE IMAGE POST
========================================================= */

export const createImagePostThunk = createAsyncThunk(
  "post/createImagePost",
  async (
    {
      token,
      content,
      files,
    }: {
      token: string;
      content: string;
      files: {
        uri: string;
        name: string;
        type: string;
      }[];
    },
    { rejectWithValue },
  ) => {
    try {
      return await createImagePost(token, content, files);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create image post",
      );
    }
  },
);

/* =========================================================
   CREATE REEL
========================================================= */

export const createReelPostThunk = createAsyncThunk(
  "post/createReelPost",
  async (
    {
      token,
      content,
      file,
    }: {
      token: string;
      content: string;
      file: {
        uri: string;
        name: string;
        type: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await createReelPost(token, content, file);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create video post",
      );
    }
  },
);

/* =========================================================
   FETCH SINGLE POST
========================================================= */

export const fetchPost = createAsyncThunk(
  "post/fetchPost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getPost(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load post",
      );
    }
  },
);

/* =========================================================
   EDIT POST
========================================================= */

export const editPost = createAsyncThunk(
  "post/editPost",
  async (
    {
      postId,
      token,
      data,
    }: {
      postId: string;
      token: string;
      data: {
        content: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await updatePost(postId, token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update post",
      );
    }
  },
);

/* =========================================================
   DELETE POST
========================================================= */

export const removePost = createAsyncThunk(
  "post/removePost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      await deletePost(postId, token);

      return postId;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to delete post",
      );
    }
  },
);

/* =========================================================
   POST LIKE
========================================================= */

export const likePostThunk = createAsyncThunk(
  "post/likePost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await likePost(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to like post",
      );
    }
  },
);

export const unlikePostThunk = createAsyncThunk(
  "post/unlikePost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await unlikePost(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to unlike post",
      );
    }
  },
);

/* =========================================================
   COMMENT LIKE
========================================================= */

export const likeCommentThunk = createAsyncThunk(
  "post/likeComment",
  async (
    {
      postId,
      commentId,
      token,
    }: {
      postId: string;
      commentId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await likeComment(postId, commentId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to like comment",
      );
    }
  },
);

export const unlikeCommentThunk = createAsyncThunk(
  "post/unlikeComment",
  async (
    {
      postId,
      commentId,
      token,
    }: {
      postId: string;
      commentId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await unlikeComment(postId, commentId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to unlike comment",
      );
    }
  },
);

/* =========================================================
   SHARE
========================================================= */

export const sharePostThunk = createAsyncThunk(
  "post/sharePost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await sharePost(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to share post",
      );
    }
  },
);

/* =========================================================
   BOOKMARK
========================================================= */

export const bookmarkPostThunk = createAsyncThunk(
  "post/bookmarkPost",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await bookmarkPost(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to bookmark post",
      );
    }
  },
);

export const removeBookmarkThunk = createAsyncThunk(
  "post/removeBookmark",
  async (
    {
      postId,
      token,
    }: {
      postId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await removeBookmark(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to remove bookmark",
      );
    }
  },
);

/* =========================================================
   FETCH COMMENTS
========================================================= */

export const fetchComments = createAsyncThunk(
  "post/fetchComments",
  async (
    {
      postId,
      token,
      parentComment,
    }: {
      postId: string;
      token: string;
      parentComment?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getComments(postId, token, parentComment);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load comments",
      );
    }
  },
);

/* =========================================================
   CREATE COMMENT / REPLY

   `data.file`, when present, is a recorded voice note — addComment
   sends it as multipart form data instead of JSON. `body` is now
   optional: a voice comment may carry no typed text at all, just the
   recording (an optional caption alongside it is still supported).
========================================================= */

export const createComment = createAsyncThunk(
  "post/createComment",
  async (
    {
      postId,
      token,
      data,
    }: {
      postId: string;
      token: string;
      data: {
        body?: string;
        parentComment?: string;
        file?: {
          uri: string;
          name: string;
          type: string;
        };
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await addComment(postId, token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to add comment",
      );
    }
  },
);

/* =========================================================
   DELETE COMMENT
========================================================= */

export const removeComment = createAsyncThunk(
  "post/removeComment",
  async (
    {
      postId,
      commentId,
      token,
    }: {
      postId: string;
      commentId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await deleteComment(postId, commentId, token);

      return {
        postId,
        commentId,
        result,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to delete comment",
      );
    }
  },
);
