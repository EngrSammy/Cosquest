import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  fetchFollowers,
  fetchFollowing,
  followUserThunk,
  unfollowUserThunk,
} from "../thunks/followThunks";

type User = {
  id: string;
  username: string;
  name: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

type FollowState = {
  followers: User[];
  following: User[];

  followersTotal: number;
  followingTotal: number;

  followersHasMore: boolean;
  followingHasMore: boolean;

  loading: boolean;
  error: string | null;
};

const initialState: FollowState = {
  followers: [],
  following: [],

  followersTotal: 0,
  followingTotal: 0,

  followersHasMore: false,
  followingHasMore: false,

  loading: false,
  error: null,
};

const followSlice = createSlice({
  name: "follow",
  initialState,

  reducers: {
    clearFollowers(state) {
      state.followers = [];
      state.followersTotal = 0;
      state.followersHasMore = false;
    },

    clearFollowing(state) {
      state.following = [];
      state.followingTotal = 0;
      state.followingHasMore = false;
    },

    clearFollowError(state) {
      state.error = null;
    },

    // ======================================
    // SOCKET — SOMEONE FOLLOWED YOU
    // ======================================
    // There is no dedicated "user:followed" socket event on the
    // backend — a follow arrives as a generic notification:new with
    // type:"follow", handled globally in useSocketConnection.ts (not
    // per-screen, since a follow can happen while you're anywhere in
    // the app, not just on the Followers screen) and dispatched here.
    //
    // unfollowUser has no socket event at all — it's a plain DB delete
    // on the backend, so there's genuinely nothing to react to live for
    // an unfollow; that side stays exactly as it was; REST/refetch only.
    socketFollowerAdded(state, action: PayloadAction<User>) {
      const actor = action.payload;

      if (!actor?.id) {
        return;
      }

      const alreadyPresent = state.followers.some(
        (user) => user.id === actor.id,
      );

      if (!alreadyPresent) {
        state.followers.unshift(actor);
      }

      state.followersTotal += 1;
    },
  },

  extraReducers: (builder) => {
    builder

      .addCase(fetchFollowers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchFollowers.fulfilled, (state, action) => {
        state.loading = false;

        state.followers = action.payload.users;

        state.followersTotal = action.payload.pagination.total;

        state.followersHasMore = action.payload.pagination.hasMore;
      })

      .addCase(fetchFollowers.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load followers";
      })

      .addCase(fetchFollowing.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchFollowing.fulfilled, (state, action) => {
        state.loading = false;

        state.following = action.payload.users;

        state.followingTotal = action.payload.pagination.total;

        state.followingHasMore = action.payload.pagination.hasMore;
      })

      .addCase(fetchFollowing.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load following";
      })

      .addCase(followUserThunk.pending, (state) => {
        state.error = null;
      })

      .addCase(followUserThunk.fulfilled, (state) => {
        state.error = null;
        state.loading = false;
      })

      .addCase(followUserThunk.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to follow user";
      })

      .addCase(unfollowUserThunk.pending, (state) => {
        state.error = null;
      })

      .addCase(unfollowUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;

        const username = action.meta.arg.username;

        state.following = state.following.filter(
          (user) => user.username.toLowerCase() !== username.toLowerCase(),
        );

        if (state.followingTotal > 0) {
          state.followingTotal -= 1;
        }
      })

      .addCase(unfollowUserThunk.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to unfollow user";
      });
  },
});

export const {
  clearFollowers,
  clearFollowing,
  clearFollowError,
  socketFollowerAdded,
} = followSlice.actions;

export default followSlice.reducer;
