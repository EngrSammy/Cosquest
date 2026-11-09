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

const unfollowedAside = new Map<string, unknown>();

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

      // FOLLOW STRAIGHT AWAY: the button shows "Following" as soon as it's
      // tapped; if the server says no, it changes back.
      .addCase(followUserThunk.pending, (state, action) => {
        state.error = null;
        const username = action.meta.arg.username;
        if (!state.following.some((user) => user.username?.toLowerCase() === username.toLowerCase())) {
          state.following.unshift({ username } as any);
          state.followingTotal += 1;
        }
      })

      .addCase(followUserThunk.fulfilled, (state) => {
        state.error = null;
        state.loading = false;
      })

      .addCase(followUserThunk.rejected, (state, action) => {
        state.loading = false;
        const username = action.meta.arg.username.toLowerCase();
        const before = state.following.length;
        state.following = state.following.filter((user) => user.username?.toLowerCase() !== username);
        if (state.following.length < before && state.followingTotal > 0) state.followingTotal -= 1;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to follow user";
      })

      // UNFOLLOW STRAIGHT AWAY (kept aside in case the server says no).
      .addCase(unfollowUserThunk.pending, (state, action) => {
        state.error = null;
        const username = action.meta.arg.username.toLowerCase();
        const index = state.following.findIndex((user) => user.username?.toLowerCase() === username);
        if (index >= 0) {
          unfollowedAside.set(username, state.following[index] as any);
          state.following.splice(index, 1);
          if (state.followingTotal > 0) state.followingTotal -= 1;
        }
      })

      .addCase(unfollowUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        unfollowedAside.delete(action.meta.arg.username.toLowerCase());
      })

      .addCase(unfollowUserThunk.rejected, (state, action) => {
        state.loading = false;
        const username = action.meta.arg.username.toLowerCase();
        const kept = unfollowedAside.get(username);
        unfollowedAside.delete(username);
        if (kept && !state.following.some((user) => user.username?.toLowerCase() === username)) {
          state.following.unshift(kept as any);
          state.followingTotal += 1;
        }

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
