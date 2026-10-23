// ==========================================
// SCHEDULED CALLS - thunks (group Calls tab)
// ==========================================
// Each one calls services/scheduledCalls.ts (Emmanuel's routes, or Sammy's
// mock while they aren't deployed) and the slice keeps the result, so the
// Calls tab, Call details and the Schedule form share one copy of each call.
// Failures reject with the server's message (a string).
import { createAsyncThunk } from "@reduxjs/toolkit";

import type { GroupPerson } from "@/services/groups";
import {
  cancelScheduledCall,
  createScheduledCall,
  getScheduledCall,
  listScheduledCalls,
  messageOf,
  respondToScheduledCall,
  type ScheduledCall,
  type ScheduledCallInput,
} from "@/services/scheduledCalls";

const failed = (error: unknown, fallback: string) => messageOf(error) || fallback;

export const fetchScheduledCalls = createAsyncThunk<
  { conversationId: string; calls: ScheduledCall[] },
  { conversationId: string; token: string },
  { rejectValue: string }
>("scheduledCalls/fetchForChat", async ({ conversationId, token }, { rejectWithValue }) => {
  try {
    return { conversationId, calls: await listScheduledCalls(conversationId, token) };
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't load calls."));
  }
});

export const fetchScheduledCall = createAsyncThunk<
  ScheduledCall,
  { callId: string; token: string },
  { rejectValue: string }
>("scheduledCalls/fetchOne", async ({ callId, token }, { rejectWithValue }) => {
  try {
    return await getScheduledCall(callId, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't load this call."));
  }
});

export const createScheduledCallThunk = createAsyncThunk<
  ScheduledCall,
  { conversationId: string; input: ScheduledCallInput; host: GroupPerson; token: string },
  { rejectValue: string }
>("scheduledCalls/create", async ({ conversationId, input, host, token }, { rejectWithValue }) => {
  try {
    return await createScheduledCall(conversationId, input, host, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't schedule the call."));
  }
});

export const cancelScheduledCallThunk = createAsyncThunk<
  ScheduledCall,
  { callId: string; token: string },
  { rejectValue: string }
>("scheduledCalls/cancel", async ({ callId, token }, { rejectWithValue }) => {
  try {
    return await cancelScheduledCall(callId, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't cancel the call."));
  }
});

export const respondScheduledCallThunk = createAsyncThunk<
  ScheduledCall,
  { callId: string; status: "accepted" | "declined"; me: GroupPerson; token: string },
  { rejectValue: string }
>("scheduledCalls/rsvp", async ({ callId, status, me, token }, { rejectWithValue }) => {
  try {
    return await respondToScheduledCall(callId, status, me, token);
  } catch (error) {
    return rejectWithValue(failed(error, "Couldn't send your reply."));
  }
});
