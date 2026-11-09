import {
  getQuest,
  getQuests,
  registerForQuest,
  unregisterFromQuest,
} from "@/services/quests";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchQuests = createAsyncThunk(
  "quest/fetchQuests",
  async (
    params:
      | {
          status?: string;
          lat?: number;
          lng?: number;
          radiusMiles?: number;
        }
      | undefined,
    { rejectWithValue },
  ) => {
    try {
      return await getQuests(params);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load quests",
      );
    }
  },
);

export const fetchQuest = createAsyncThunk(
  "quest/fetchQuest",
  async (
    {
      questId,
    }: {
      questId: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getQuest(questId);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load quest",
      );
    }
  },
);

export const registerQuest = createAsyncThunk(
  "quest/registerQuest",
  async (
    {
      questId,
      token,
    }: {
      questId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerForQuest(questId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to register for quest",
      );
    }
  },
);

export const unregisterQuest = createAsyncThunk(
  "quest/unregisterQuest",
  async (
    {
      questId,
      token,
    }: {
      questId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await unregisterFromQuest(questId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to unregister from quest",
      );
    }
  },
);
