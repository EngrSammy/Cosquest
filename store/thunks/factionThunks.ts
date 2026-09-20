import { getFactions } from "@/services/faction";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchFactions = createAsyncThunk(
  "faction/fetchFactions",
  async (_, { rejectWithValue }) => {
    try {
      const response = await getFactions();

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch factions";

      return rejectWithValue(message);
    }
  },
);
