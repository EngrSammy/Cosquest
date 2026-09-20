import {
  followUser,
  getFollowers,
  getFollowing,
  unfollowUser,
} from "@/services/follow";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchFollowers = createAsyncThunk(
  "follow/fetchFollowers",
  async (
    {
      username,
      token,
      search = "",
    }: {
      username: string;
      token: string;
      search?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getFollowers(username, token, search);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load followers",
      );
    }
  },
);

export const fetchFollowing = createAsyncThunk(
  "follow/fetchFollowing",
  async (
    {
      username,
      token,
      search = "",
    }: {
      username: string;
      token: string;
      search?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getFollowing(username, token, search);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load following",
      );
    }
  },
);

export const followUserThunk = createAsyncThunk(
  "follow/followUser",
  async (
    {
      username,
      token,
    }: {
      username: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await followUser(username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to follow user",
      );
    }
  },
);

export const unfollowUserThunk = createAsyncThunk(
  "follow/unfollowUser",
  async (
    {
      username,
      token,
    }: {
      username: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await unfollowUser(username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to unfollow user",
      );
    }
  },
);
