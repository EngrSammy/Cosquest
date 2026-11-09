import { getFactionMembers, getFactions } from "@/services/faction";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchFactions = createAsyncThunk(
  "faction/fetchFactions",
  async (_, { rejectWithValue }) => {
    try {
      return await getFactions();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch factions";

      return rejectWithValue(message);
    }
  },
);

// The profile faction card's live data — one faction's real member
// count + a small avatar-row preview.
export const fetchFactionMembers = createAsyncThunk(
  "faction/fetchFactionMembers",
  async (
    {
      key,
      page,
      limit,
    }: {
      key: string;
      page?: number;
      limit?: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getFactionMembers(key, page, limit);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch faction members";

      return rejectWithValue(message);
    }
  },
);
