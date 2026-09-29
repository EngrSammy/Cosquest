import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
      acceptCall,
      declineCall,
      endCall,
      fetchIncomingCall,
      refreshCall,
      startCall,
} from "../thunks/callThunks";

import type { Call, CallJoinInfo } from "@/services/calls";

export type ActiveCall = CallJoinInfo & {
  // outgoing → I started it; incoming → I answered it
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

  starting: boolean;

  error: string | null;
};

const initialState: CallState = {
  active: null,
  incoming: null,
  dismissedIds: [],
  starting: false,
  error: null,
};

const MAX_DISMISSED = 20;

function rememberDismissed(state: CallState, callId: string) {
  if (!state.dismissedIds.includes(callId)) {
    state.dismissedIds.push(callId);
  }

  if (state.dismissedIds.length > MAX_DISMISSED) {
    state.dismissedIds = state.dismissedIds.slice(-MAX_DISMISSED);
  }
}

// Shared by the socket event and the REST safety net, so both behave
// exactly the same way.
function applyIncoming(state: CallState, call: Call | null) {
  const shouldRing =
    !!call &&
    call.status === "ringing" &&
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

  // Caller cancelled, or it was missed / answered on another device →
  // close the ringing screen.
  if (state.incoming?.id === call.id && call.status !== "ringing") {
    state.incoming = null;
    rememberDismissed(state, call.id);
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
      // DECLINE — hide the ringing screen right away
      // ======================================

      .addCase(declineCall.pending, (state, action) => {
        rememberDismissed(state, action.meta.arg.callId);

        if (state.incoming?.id === action.meta.arg.callId) {
          state.incoming = null;
        }
      })

      // ======================================
      // END
      // ======================================

      .addCase(endCall.fulfilled, (state, action) => {
        applyUpdate(state, action.payload);
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
  clearActiveCall,
  dismissIncomingCall,
  clearCalls,
} = callSlice.actions;

export default callSlice.reducer;
