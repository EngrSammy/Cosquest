import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  acceptCall,
  declineCall,
  endCall,
  fetchIncomingCall,
  inviteToCall,
  refreshCall,
  rejoinCall,
  startCall,
} from "../thunks/callThunks";

import type { Call, CallJoinInfo } from "@/services/calls";

export type ActiveCall = CallJoinInfo & {
  // outgoing → I started it; incoming → I answered (or was added to) it
  direction: "outgoing" | "incoming";
};

type CallState = {
  // The call this phone is in (or dialling). Only one at a time.
  active: ActiveCall | null;

  // A call ringing on this phone, waiting for Accept / Decline.
  incoming: Call | null;

  // Calls already declined/finished here, so a late socket event or
  // safety-net check can't pop the ringing screen back up.
  dismissedIds: string[];

  // When each of those was dismissed (ms), so being ADDED again later
  // (a newer invite) can ring again.
  dismissedAt: Record<string, number>;

  // Your own user id (from your sign-in token). In a group call the call
  // keeps going while you're still ringing, so the ringing screen has to
  // check YOUR status, not the call's.
  myUserId: string | null;

  starting: boolean;

  error: string | null;
};

const initialState: CallState = {
  active: null,
  incoming: null,
  dismissedIds: [],
  dismissedAt: {},
  myUserId: null,
  starting: false,
  error: null,
};

const MAX_DISMISSED = 20;

const ACTIVE_STATUSES = ["ringing", "accepted"];

function rememberDismissed(state: CallState, callId: string) {
  if (!state.dismissedIds.includes(callId)) {
    state.dismissedIds.push(callId);
  }

  state.dismissedAt[callId] = Date.now();

  if (state.dismissedIds.length > MAX_DISMISSED) {
    const removed = state.dismissedIds.slice(0, -MAX_DISMISSED);
    state.dismissedIds = state.dismissedIds.slice(-MAX_DISMISSED);
    removed.forEach((id) => delete state.dismissedAt[id]);
  }
}

function forgetDismissed(state: CallState, callId: string) {
  state.dismissedIds = state.dismissedIds.filter((id) => id !== callId);
  delete state.dismissedAt[callId];
}

// Is this call ringing on MY phone right now?
function ringingForMe(state: CallState, call: Call) {
  if (!ACTIVE_STATUSES.includes(call.status)) {
    return false;
  }

  const mine = state.myUserId
    ? call.members.find((member) => member.user.id === state.myUserId)
    : null;

  // Newer backend: check my own status.
  if (mine) {
    return mine.status === "ringing";
  }

  // Older backend (no members yet): a ringing call is ringing for me.
  return call.status === "ringing";
}

// Shared by the socket event and the REST safety net, so both behave
// exactly the same way.
function applyIncoming(state: CallState, call: Call | null) {
  if (!call) {
    return;
  }

  // Added again to a call I declined or left earlier → ring again, but
  // only for an invite NEWER than when I dismissed it (an old, late event
  // must not ring again).
  if (state.dismissedIds.includes(call.id) && ringingForMe(state, call)) {
    const mine = call.members.find(
      (member) => member.user.id === state.myUserId,
    );
    const invitedAt = mine?.invitedAt ? Date.parse(mine.invitedAt) : NaN;
    const dismissedAt = state.dismissedAt[call.id] ?? 0;

    if (Number.isFinite(invitedAt) && invitedAt > dismissedAt) {
      forgetDismissed(state, call.id);
    }
  }

  const shouldRing =
    ringingForMe(state, call) &&
    !state.dismissedIds.includes(call.id) &&
    state.active?.call.id !== call.id;

  if (shouldRing) {
    state.incoming = call;
  }
}

function applyUpdate(state: CallState, call: Call) {
  if (state.active && state.active.call.id === call.id) {
    state.active.call = { ...state.active.call, ...call };
  }

  if (state.incoming?.id === call.id) {
    if (ringingForMe(state, call)) {
      // Still ringing for me — keep the screen, with the latest people.
      state.incoming = call;
    } else {
      // Caller cancelled, it was missed, or I answered on another device →
      // close the ringing screen.
      state.incoming = null;
      rememberDismissed(state, call.id);
    }
  }
}

const callSlice = createSlice({
  name: "call",

  initialState,

  reducers: {
    // ======================================
    // SOCKET — call:incoming
    // ======================================

    socketCallIncoming(state, action: PayloadAction<{ call: Call }>) {
      applyIncoming(state, action.payload.call);
    },

    // ======================================
    // SOCKET — call:updated
    // ======================================

    socketCallUpdated(state, action: PayloadAction<{ call: Call }>) {
      applyUpdate(state, action.payload.call);
    },

    // ======================================
    // LOCAL
    // ======================================

    setCallUserId(state, action: PayloadAction<string | null>) {
      state.myUserId = action.payload;
    },

    clearActiveCall(state) {
      if (state.active) {
        rememberDismissed(state, state.active.call.id);
      }

      state.active = null;
    },

    dismissIncomingCall(state, action: PayloadAction<string>) {
      rememberDismissed(state, action.payload);

      if (state.incoming?.id === action.payload) {
        state.incoming = null;
      }
    },

    // Call on logout, next to clearChats().
    clearCalls() {
      return initialState;
    },
  },

  extraReducers: (builder) => {
    builder

      // ======================================
      // START
      // ======================================

      .addCase(startCall.pending, (state) => {
        state.starting = true;
        state.error = null;
      })

      .addCase(startCall.fulfilled, (state, action) => {
        state.starting = false;
        state.active = { ...action.payload, direction: "outgoing" };
      })

      .addCase(startCall.rejected, (state, action) => {
        state.starting = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to start call";
      })

      // ======================================
      // ACCEPT
      // ======================================

      .addCase(acceptCall.fulfilled, (state, action) => {
        state.active = { ...action.payload, direction: "incoming" };
        state.incoming = null;
      })

      .addCase(acceptCall.rejected, (state, action) => {
        // Usually the caller hung up a moment before Accept was tapped.
        rememberDismissed(state, action.meta.arg.callId);
        state.incoming = null;
      })

      // ======================================
      // REJOIN
      // ======================================

      .addCase(rejoinCall.fulfilled, (state, action) => {
        forgetDismissed(state, action.payload.call.id);
        state.active = { ...action.payload, direction: "incoming" };
        state.incoming = null;
      })

      // ======================================
      // DECLINE — hide the ringing screen right away
      // ======================================

      .addCase(declineCall.pending, (state, action) => {
        rememberDismissed(state, action.meta.arg.callId);

        if (state.incoming?.id === action.meta.arg.callId) {
          state.incoming = null;
        }
      })

      // ======================================
      // END / LEAVE
      // ======================================

      .addCase(endCall.fulfilled, (state, action) => {
        applyUpdate(state, action.payload);
      })

      // ======================================
      // ADD PEOPLE — show them straight away
      // ======================================

      .addCase(inviteToCall.fulfilled, (state, action) => {
        applyUpdate(state, action.payload.call);
      })

      // ======================================
      // SAFETY NETS
      // ======================================

      .addCase(fetchIncomingCall.fulfilled, (state, action) => {
        applyIncoming(state, action.payload);
      })

      .addCase(refreshCall.fulfilled, (state, action) => {
        applyUpdate(state, action.payload);
      });
  },
});

export const {
  socketCallIncoming,
  socketCallUpdated,
  setCallUserId,
  clearActiveCall,
  dismissIncomingCall,
  clearCalls,
} = callSlice.actions;

export default callSlice.reducer;
