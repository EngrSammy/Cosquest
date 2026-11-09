import type { Faction, FactionMembersResponse } from "@/services/faction";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { fetchFactionMembers, fetchFactions } from "../thunks/factionThunks";

type FactionState = {
  factions: Faction[];
  selectedFaction: string | null;
  loading: boolean;
  error: string | null;

  // Keyed by faction key ("celestials", etc.) — the profile card's live
  // member count + avatar-row preview. A record rather than one shared
  // value so more than one faction's detail can be held at once without
  // separate screens clobbering each other's fetch.
  membersByFaction: Record<string, FactionMembersResponse>;
  membersLoading: Record<string, boolean>;
  membersError: Record<string, string | null>;
};

const initialState: FactionState = {
  factions: [],
  selectedFaction: null,
  loading: false,
  error: null,

  membersByFaction: {},
  membersLoading: {},
  membersError: {},
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
      })

      .addCase(fetchFactionMembers.pending, (state, action) => {
        const key = action.meta.arg.key;

        state.membersLoading[key] = true;
        state.membersError[key] = null;
      })

      .addCase(fetchFactionMembers.fulfilled, (state, action) => {
        const key = action.meta.arg.key;

        state.membersLoading[key] = false;
        state.membersError[key] = null;
        state.membersByFaction[key] = action.payload;
      })

      .addCase(fetchFactionMembers.rejected, (state, action) => {
        const key = action.meta.arg.key;

        state.membersLoading[key] = false;
        state.membersError[key] =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load faction members";
      });
  },
});

export const { selectFaction, clearSelectedFaction } = factionSlice.actions;

export default factionSlice.reducer;
