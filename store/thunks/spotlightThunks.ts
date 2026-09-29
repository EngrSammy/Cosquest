import { createAsyncThunk } from "@reduxjs/toolkit";

import {
      getMySpotlightPoints,
      getSpotlightLeaderboard,
      getSpotlightRealms,
} from "@/services/spotlight";

/* =========================================================
   FETCH LEADERBOARD
========================================================= */

export const fetchSpotlightLeaderboard = createAsyncThunk(
  "spotlight/fetchLeaderboard",
  async (
    {
      token,
      page = 1,
      limit = 20,
      interest,
    }: {
      token: string;
      page?: number;
      limit?: number;
      interest?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getSpotlightLeaderboard(token, page, limit, interest);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to load Spotlight leaderboard.",
      );
    }
  },
);

/* =========================================================
   FETCH REALMS
========================================================= */

export const fetchSpotlightRealms = createAsyncThunk(
  "spotlight/fetchRealms",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getSpotlightRealms(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to load Spotlight realms.",
      );
    }
  },
);

/* =========================================================
   FETCH MY POINTS
========================================================= */

export const fetchMySpotlightPoints = createAsyncThunk(
  "spotlight/fetchMyPoints",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getMySpotlightPoints(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load your points.",
      );
    }
  },
);
