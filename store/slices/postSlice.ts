import { createSlice } from "@reduxjs/toolkit";
import {
  createNewPost,
  editPost,
  fetchPost,
  fetchPosts,
  removePost,
} from "../thunks/postThunks";

type Post = {
  id: string;
  content?: string;
  image?: string;
  userId?: string;
  username?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  bookmarked?: boolean;
};

type PostState = {
  posts: Post[];
  selectedPost: Post | null;
  loading: boolean;
  error: string | null;
};

const initialState: PostState = {
  posts: [],
  selectedPost: null,
  loading: false,
  error: null,
};

const postSlice = createSlice({
  name: "post",
  initialState,

  reducers: {
    setSelectedPost(state, action) {
      state.selectedPost = action.payload as Post;
    },

    clearSelectedPost(state) {
      state.selectedPost = null;
    },

    clearPosts(state) {
      state.posts = [];
      state.selectedPost = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.loading = false;

        state.posts = action.payload as Post[];
      })

      .addCase(fetchPosts.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load posts";
      })

      .addCase(createNewPost.fulfilled, (state, action) => {
        if (!action.payload) return;

        const post = action.payload as Post;

        state.posts.unshift(post);
      })

      .addCase(fetchPost.fulfilled, (state, action) => {
        state.selectedPost = action.payload as Post;
      })

      .addCase(editPost.fulfilled, (state, action) => {
        if (!action.payload) return;

        const updatedPost = action.payload as Post;

        const index = state.posts.findIndex(
          (post) => post.id === updatedPost.id,
        );

        if (index !== -1) {
          state.posts[index] = updatedPost;
        }

        if (state.selectedPost?.id === updatedPost.id) {
          state.selectedPost = updatedPost;
        }
      })

      .addCase(removePost.fulfilled, (state, action) => {
        const postId = action.payload as string;

        state.posts = state.posts.filter((post) => post.id !== postId);

        if (state.selectedPost?.id === postId) {
          state.selectedPost = null;
        }
      });
  },
});

export const { setSelectedPost, clearSelectedPost, clearPosts } =
  postSlice.actions;

export default postSlice.reducer;
