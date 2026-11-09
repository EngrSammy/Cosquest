import { createSlice } from "@reduxjs/toolkit";

import type { SpotlightEntry, SpotlightRealm } from "@/services/spotlight";

import {
      fetchMySpotlightPoints,
      fetchSpotlightLeaderboard,
      fetchSpotlightRealms,
} from "../thunks/spotlightThunks";

type SpotlightState = {
  leaderboard: SpotlightEntry[];

  realms: SpotlightRealm[];

  myPoints: number;

  myLevel?: number;

  myRealm?: string;

  page: number;

  limit: number;

  total?: number;

  totalPages?: number;

  hasNextPage: boolean;

  loading: boolean;

  realmsLoading: boolean;

  pointsLoading: boolean;

  error: string | null;
};

const initialState: SpotlightState = {
  leaderboard: [],

  realms: [],

  myPoints: 0,

  myLevel: undefined,

  myRealm: undefined,

  page: 1,

  limit: 20,

  total: undefined,

  totalPages: undefined,

  hasNextPage: false,

  loading: false,

  realmsLoading: false,

  pointsLoading: false,

  error: null,
};

const spotlightSlice = createSlice({
  name: "spotlight",

  initialState,

  reducers: {
    clearSpotlight(state) {
      state.leaderboard = [];

      state.page = 1;

      state.total = undefined;

      state.totalPages = undefined;

      state.hasNextPage = false;

      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder

      /* ===================================================
         LEADERBOARD
      =================================================== */

      .addCase(fetchSpotlightLeaderboard.pending, (state) => {
        state.loading = true;

        state.error = null;
      })

      .addCase(fetchSpotlightLeaderboard.fulfilled, (state, action) => {
        state.loading = false;

        state.error = null;

        state.leaderboard = action.payload.leaderboard;

        state.page = action.payload.page ?? 1;

        state.limit = action.payload.limit ?? 20;

        state.total = action.payload.total;

        state.totalPages = action.payload.totalPages;

        state.hasNextPage = action.payload.hasNextPage ?? false;
      })

      .addCase(fetchSpotlightLeaderboard.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load Spotlight leaderboard.";
      })

      /* ===================================================
         REALMS
      =================================================== */

      .addCase(fetchSpotlightRealms.pending, (state) => {
        state.realmsLoading = true;
      })

      .addCase(fetchSpotlightRealms.fulfilled, (state, action) => {
        state.realmsLoading = false;

        state.realms = action.payload || [];
      })

      .addCase(fetchSpotlightRealms.rejected, (state) => {
        state.realmsLoading = false;
      })

      /* ===================================================
         MY POINTS
      =================================================== */

      .addCase(fetchMySpotlightPoints.pending, (state) => {
        state.pointsLoading = true;
      })

      .addCase(fetchMySpotlightPoints.fulfilled, (state, action) => {
        state.pointsLoading = false;

        const response = action.payload;

        state.myPoints = Number(
          response?.points ??
            response?.totalPoints ??
            response?.data?.points ??
            response?.data?.totalPoints ??
            0,
        );

        state.myLevel = response?.level ?? response?.data?.level;

        state.myRealm = response?.realm ?? response?.data?.realm;
      })

      .addCase(fetchMySpotlightPoints.rejected, (state) => {
        state.pointsLoading = false;
      });
  },
});

export const { clearSpotlight } = spotlightSlice.actions;

export default spotlightSlice.reducer;
