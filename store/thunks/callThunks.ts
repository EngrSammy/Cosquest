import { createAsyncThunk } from "@reduxjs/toolkit";

import {
      acceptCallRequest,
      declineCallRequest,
      endCallRequest,
      getCall,
      getIncomingCall,
      startCallRequest,
} from "@/services/calls";

import type { CallType } from "@/services/calls";

// Same rule as userThunks: this file imports ONLY from services — never
// from the store or a slice — so there's no circular-import
// "Cannot read property 'pending' of undefined" crash.

// ==========================================
// START CALL
// ==========================================

export const startCall = createAsyncThunk(
  "call/startCall",
  async (
    {
      conversationId,
      type,
      token,
    }: {
      conversationId: string;
      type: CallType;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await startCallRequest(conversationId, type, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to start call",
      );
    }
  },
);

// ==========================================
// ACCEPT CALL
// ==========================================

export const acceptCall = createAsyncThunk(
  "call/acceptCall",
  async (
    {
      callId,
      token,
    }: {
      callId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await acceptCallRequest(callId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to answer call",
      );
    }
  },
);

// ==========================================
// DECLINE CALL
// ==========================================

export const declineCall = createAsyncThunk(
  "call/declineCall",
  async (
    {
      callId,
      token,
    }: {
      callId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await declineCallRequest(callId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to decline call",
      );
    }
  },
);

// ==========================================
// END CALL
// ==========================================

export const endCall = createAsyncThunk(
  "call/endCall",
  async (
    {
      callId,
      token,
    }: {
      callId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await endCallRequest(callId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to end call",
      );
    }
  },
);

// ==========================================
// INCOMING CALL (safety net)
// ==========================================
// Sockets deliver call:incoming instantly. This is only used when the app
// comes back to the foreground or the socket reconnects, in case the
// event was missed while the phone was asleep.

export const fetchIncomingCall = createAsyncThunk(
  "call/fetchIncomingCall",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getIncomingCall(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to check calls",
      );
    }
  },
);

// ==========================================
// REFRESH ONE CALL (safety net)
// ==========================================

export const refreshCall = createAsyncThunk(
  "call/refreshCall",
  async (
    {
      callId,
      token,
    }: {
      callId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getCall(callId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load call",
      );
    }
  },
);
