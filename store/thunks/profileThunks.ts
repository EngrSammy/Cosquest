import {
  getUserPosts,
  getUserProfile,
  getUserQuests,
} from "@/services/profile";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchUserProfile = createAsyncThunk(
  "profile/fetchUserProfile",
  async (
    { username, token }: { username: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await getUserProfile(username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load profile",
      );
    }
  },
);

export const fetchUserProfileQuests = createAsyncThunk(
  "profile/fetchUserProfileQuests",
  async (
    { username, token }: { username: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await getUserQuests(username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load user quests",
      );
    }
  },
);

export const fetchUserProfilePosts = createAsyncThunk(
  "profile/fetchUserProfilePosts",
  async (
    { username, token }: { username: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      return await getUserPosts(username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load user posts",
      );
    }
  },
);
