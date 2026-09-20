import {
  getNotifications,
  markNotificationsAsRead,
} from "@/services/notifications";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchNotifications = createAsyncThunk(
  "notification/fetchNotifications",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getNotifications(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load notifications",
      );
    }
  },
);

export const markNotificationsRead = createAsyncThunk(
  "notification/markNotificationsRead",
  async (token: string, { rejectWithValue }) => {
    try {
      return await markNotificationsAsRead(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to mark notifications as read",
      );
    }
  },
);
