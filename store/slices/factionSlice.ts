import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { fetchFactions } from "../thunks/factionThunks";

type Faction = {
  id: string;
  name: string;
  description?: string;
  image?: string;
};

type FactionState = {
  factions: Faction[];
  selectedFaction: string | null;
  loading: boolean;
  error: string | null;
};

const initialState: FactionState = {
  factions: [],
  selectedFaction: null,
  loading: false,
  error: null,
};

const factionSlice = createSlice({
  name: "faction",
  initialState,

  reducers: {
    selectFaction: (state, action: PayloadAction<string>) => {
      state.selectedFaction = action.payload;
    },

    clearSelectedFaction: (state) => {
      state.selectedFaction = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchFactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchFactions.fulfilled, (state, action) => {
        state.loading = false;
        state.factions = action.payload;
        state.error = null;
      })

      .addCase(fetchFactions.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load factions";
      });
  },
});

export const { selectFaction, clearSelectedFaction } = factionSlice.actions;

export default factionSlice.reducer;
