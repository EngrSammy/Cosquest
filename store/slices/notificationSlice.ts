import { createSlice } from "@reduxjs/toolkit";
import {
  fetchNotifications,
  markNotificationsRead,
} from "../thunks/notificationThunks";

type Notification = {
  id: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
};

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
};

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

const notificationSlice = createSlice({
  name: "notification",
  initialState,

  reducers: {
    clearNotifications(state) {
      state.notifications = [];
      state.unreadCount = 0;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;

        const notifications = action.payload as Notification[];

        state.notifications = notifications;

        state.unreadCount = notifications.filter(
          (notification: Notification) => !notification.read,
        ).length;
      })

      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load notifications";
      })

      .addCase(markNotificationsRead.pending, (state) => {
        state.loading = true;
      })

      .addCase(markNotificationsRead.fulfilled, (state) => {
        state.loading = false;

        state.notifications = state.notifications.map((notification) => ({
          ...notification,
          read: true,
        }));

        state.unreadCount = 0;
      })

      .addCase(markNotificationsRead.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to mark notifications as read";
      });
  },
});

export const { clearNotifications } = notificationSlice.actions;

export default notificationSlice.reducer;
