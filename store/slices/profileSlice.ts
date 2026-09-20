import { createSlice } from "@reduxjs/toolkit";
import {
  fetchUserProfile,
  fetchUserProfilePosts,
  fetchUserProfileQuests,
} from "../thunks/profileThunks";

type Profile = {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  photo?: string;
  faction?: string;
  interests?: string[];
  followersCount?: number;
  followingCount?: number;
};

type Quest = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
};

type Post = {
  id: string;
  content?: string;
  image?: string;
  username?: string;
};

type ProfileState = {
  profile: Profile | null;
  quests: Quest[];
  posts: Post[];
  loading: boolean;
  error: string | null;
};

const initialState: ProfileState = {
  profile: null,
  quests: [],
  posts: [],
  loading: false,
  error: null,
};

const profileSlice = createSlice({
  name: "profile",
  initialState,

  reducers: {
    clearProfile(state) {
      state.profile = null;
      state.quests = [];
      state.posts = [];
      state.error = null;
    },

    clearProfileError(state) {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.profile = action.payload as Profile;
      })

      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load profile";
      })

      .addCase(fetchUserProfileQuests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchUserProfileQuests.fulfilled, (state, action) => {
        state.loading = false;
        state.quests = action.payload as Quest[];
      })

      .addCase(fetchUserProfileQuests.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load user quests";
      })

      .addCase(fetchUserProfilePosts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchUserProfilePosts.fulfilled, (state, action) => {
        state.loading = false;
        state.posts = action.payload as Post[];
      })

      .addCase(fetchUserProfilePosts.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load user posts";
      });
  },
});

export const { clearProfile, clearProfileError } = profileSlice.actions;

export default profileSlice.reducer;
