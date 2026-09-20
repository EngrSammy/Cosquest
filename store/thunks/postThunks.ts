import {
  addComment,
  bookmarkPost,
  createPost,
  deleteComment,
  deletePost,
  getComments,
  getPost,
  getPosts,
  likePost,
  removeBookmark,
  sharePost,
  unlikePost,
  updatePost,
} from "@/services/posts";
import { createAsyncThunk } from "@reduxjs/toolkit";

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

export const createNewPost = createAsyncThunk(
  "post/createNewPost",
  async (
    { token, data }: { token: string; data: unknown },
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

export const fetchPost = createAsyncThunk(
  "post/fetchPost",
  async (
    { postId, token }: { postId: string; token: string },
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
      data: unknown;
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

export const removePost = createAsyncThunk(
  "post/removePost",
  async (
    { postId, token }: { postId: string; token: string },
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

export const likePostThunk = createAsyncThunk(
  "post/likePost",
  async (
    { postId, token }: { postId: string; token: string },
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
    { postId, token }: { postId: string; token: string },
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

export const sharePostThunk = createAsyncThunk(
  "post/sharePost",
  async (
    { postId, token }: { postId: string; token: string },
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

export const bookmarkPostThunk = createAsyncThunk(
  "post/bookmarkPost",
  async (
    { postId, token }: { postId: string; token: string },
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
    { postId, token }: { postId: string; token: string },
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

export const fetchComments = createAsyncThunk(
  "post/fetchComments",
  async (
    { postId, token }: { postId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await getComments(postId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load comments",
      );
    }
  },
);

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
      data: unknown;
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
      await deleteComment(postId, commentId, token);
      return { postId, commentId };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to delete comment",
      );
    }
  },
);
