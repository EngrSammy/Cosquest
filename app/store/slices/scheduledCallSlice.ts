// ==========================================
// SCHEDULED CALLS - state (group Calls tab)
// ==========================================
//   byId:        every call the app has seen, by id
//   idsByChat:   which calls belong to each group chat (the Calls tab list)
//   loadedChats / loadingByChat / errorByChat: the Calls tab's load state
// Live updates (scheduled-call:updated) go through scheduledCallUpdated: they
// leave out the passcode, invite link and the viewer's own flags (canManage,
// canJoin), so those are kept from the copy the app already has.
import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { normalizeScheduledCall, type ScheduledCall } from "@/services/scheduledCalls";

import {
  cancelScheduledCallThunk,
  createScheduledCallThunk,
  fetchScheduledCall,
  fetchScheduledCalls,
  respondScheduledCallThunk,
  updateScheduledCallThunk,
} from "../thunks/scheduledCallThunks";

type State = {
  byId: Record<string, ScheduledCall>;
  idsByChat: Record<string, string[]>;
  loadedChats: Record<string, boolean>;
  loadingByChat: Record<string, boolean>;
  errorByChat: Record<string, string | null>;
};

const initialState: State = {
  byId: {},
  idsByChat: {},
  loadedChats: {},
  loadingByChat: {},
  errorByChat: {},
};

// Viewer-only fields a live update doesn't carry.
const PRIVATE_FIELDS = ["passcode", "inviteUrl", "canManage", "canJoin", "admission"] as const;

function keep(state: State, call: ScheduledCall) {
  state.byId[call.id] = call;
  const ids = state.idsByChat[call.conversationId];
  if (ids && !ids.includes(call.id)) ids.push(call.id);
}

const scheduledCallSlice = createSlice({
  name: "scheduledCalls",
  initialState,
  reducers: {
    // A live update from the socket: { call } as the server sent it.
    scheduledCallUpdated(state, action: PayloadAction<any>) {
      const raw = action.payload;
      if (!raw?.id) return;
      const incoming = normalizeScheduledCall(raw);
      const existing = state.byId[incoming.id];
      const merged: any = { ...existing, ...incoming };
      if (existing) {
        for (const key of PRIVATE_FIELDS) {
          if (!(key in raw)) merged[key] = (existing as any)[key];
        }
      }
      keep(state, merged as ScheduledCall);
    },
    clearScheduledCalls() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScheduledCalls.pending, (state, action) => {
        state.loadingByChat[action.meta.arg.conversationId] = true;
      })
      .addCase(fetchScheduledCalls.fulfilled, (state, action) => {
        const { conversationId, calls } = action.payload;
        calls.forEach((call) => {
          state.byId[call.id] = call;
        });
        state.idsByChat[conversationId] = calls.map((call) => call.id);
        state.loadedChats[conversationId] = true;
        state.loadingByChat[conversationId] = false;
        state.errorByChat[conversationId] = null;
      })
      .addCase(fetchScheduledCalls.rejected, (state, action) => {
        const id = action.meta.arg.conversationId;
        state.loadingByChat[id] = false;
        state.errorByChat[id] = action.payload || "Couldn't load calls.";
      })
      .addCase(fetchScheduledCall.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(createScheduledCallThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(cancelScheduledCallThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(respondScheduledCallThunk.fulfilled, (state, action) => keep(state, action.payload))
      .addCase(updateScheduledCallThunk.fulfilled, (state, action) => keep(state, action.payload));
  },
});

export const { scheduledCallUpdated, clearScheduledCalls } = scheduledCallSlice.actions;
export default scheduledCallSlice.reducer;

// ---------- selectors ----------
type WithScheduled = { scheduledCalls: State };

// One selector per Calls tab (useMemo(() => makeSelectChatCalls(), [])), so
// the list keeps the same array until something in it changes.
export const makeSelectChatCalls = () =>
  createSelector(
    [
      (state: WithScheduled) => state.scheduledCalls.byId,
      (state: WithScheduled, conversationId: string) => state.scheduledCalls.idsByChat[conversationId],
    ],
    (byId, ids) => (ids || []).map((id) => byId[id]).filter(Boolean),
  );

export const selectScheduledCall = (state: WithScheduled, callId: string | undefined) =>
  callId ? state.scheduledCalls.byId[callId] || null : null;
