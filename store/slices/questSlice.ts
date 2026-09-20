import { createSlice } from "@reduxjs/toolkit";
import {
  fetchQuest,
  fetchQuests,
  registerQuest,
  unregisterQuest,
} from "../thunks/questThunks";

type Quest = {
  id: string;
  title: string;
  description?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
};

type QuestState = {
  quests: Quest[];
  selectedQuest: Quest | null;
  loading: boolean;
  error: string | null;
};

const initialState: QuestState = {
  quests: [],
  selectedQuest: null,
  loading: false,
  error: null,
};

const questSlice = createSlice({
  name: "quest",
  initialState,

  reducers: {
    setSelectedQuest(state, action) {
      state.selectedQuest = action.payload;
    },

    clearSelectedQuest(state) {
      state.selectedQuest = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchQuests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQuests.fulfilled, (state, action) => {
        state.loading = false;
        state.quests = action.payload;
      })
      .addCase(fetchQuests.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load quests";
      })

      .addCase(fetchQuest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQuest.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedQuest = action.payload;
      })
      .addCase(fetchQuest.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load quest";
      })

      .addCase(registerQuest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerQuest.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(registerQuest.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to register for quest";
      })

      .addCase(unregisterQuest.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(unregisterQuest.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(unregisterQuest.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to unregister from quest";
      });
  },
});

export const { setSelectedQuest, clearSelectedQuest } = questSlice.actions;

export default questSlice.reducer;
