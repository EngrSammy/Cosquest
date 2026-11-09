import { createAsyncThunk } from "@reduxjs/toolkit";

import {
      createSupportRequest,
      getAppearanceSettings,
      getBlockedUsers,
      getContactSettings,
      getDataUsageSettings,
      getHelpSettings,
      getNotificationSettings,
      getPrivacySettings,
      getSettings,
      logoutUser,
      registerDevice,
      updateAppearanceSettings,
      updateContactSettings,
      updateDataUsageSettings,
      updateLocationPreference,
      updateNotificationSettings,
      updatePrivacySettings,
} from "@/services/settings";

import type {
      AppearanceSettings,
      DataUsageSettings,
      NotificationSettings,
      PrivacySettings,
} from "@/services/settings";

/* =========================================================
   ERROR HELPER
========================================================= */

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

/* =========================================================
   SETTINGS OVERVIEW
========================================================= */

export const fetchSettings = createAsyncThunk(
  "settings/fetchSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getSettings(token);
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to load settings"));
    }
  },
);

/* =========================================================
   PRIVACY
========================================================= */

export const fetchPrivacySettings = createAsyncThunk(
  "settings/fetchPrivacySettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getPrivacySettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load privacy settings"),
      );
    }
  },
);

export const updatePrivacySettingsThunk = createAsyncThunk(
  "settings/updatePrivacySettings",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Partial<PrivacySettings>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updatePrivacySettings(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update privacy settings"),
      );
    }
  },
);

/* =========================================================
   BLOCKED USERS
========================================================= */

export const fetchBlockedUsers = createAsyncThunk(
  "settings/fetchBlockedUsers",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getBlockedUsers(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load blocked users"),
      );
    }
  },
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

export const fetchNotificationSettings = createAsyncThunk(
  "settings/fetchNotificationSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getNotificationSettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load notification settings"),
      );
    }
  },
);

export const updateNotificationSettingsThunk = createAsyncThunk(
  "settings/updateNotificationSettings",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Partial<NotificationSettings>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateNotificationSettings(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update notification settings"),
      );
    }
  },
);

/* =========================================================
   DEVICE
========================================================= */

export const registerDeviceThunk = createAsyncThunk(
  "settings/registerDevice",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerDevice(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to register device"),
      );
    }
  },
);

/* =========================================================
   APPEARANCE
========================================================= */

export const fetchAppearanceSettings = createAsyncThunk(
  "settings/fetchAppearanceSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getAppearanceSettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load appearance settings"),
      );
    }
  },
);

export const updateAppearanceSettingsThunk = createAsyncThunk(
  "settings/updateAppearanceSettings",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Partial<AppearanceSettings>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateAppearanceSettings(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update appearance settings"),
      );
    }
  },
);

/* =========================================================
   DATA USAGE
========================================================= */

export const fetchDataUsageSettings = createAsyncThunk(
  "settings/fetchDataUsageSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getDataUsageSettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load data usage settings"),
      );
    }
  },
);

export const updateDataUsageSettingsThunk = createAsyncThunk(
  "settings/updateDataUsageSettings",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Partial<DataUsageSettings>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateDataUsageSettings(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update data usage settings"),
      );
    }
  },
);

/* =========================================================
   HELP
========================================================= */

export const fetchHelpSettings = createAsyncThunk(
  "settings/fetchHelpSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getHelpSettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load help information"),
      );
    }
  },
);

/* =========================================================
   SUPPORT REQUEST
========================================================= */

export const submitSupportRequest = createAsyncThunk(
  "settings/submitSupportRequest",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await createSupportRequest(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to submit support request"),
      );
    }
  },
);

/* =========================================================
   CONTACT
========================================================= */

export const fetchContactSettings = createAsyncThunk(
  "settings/fetchContactSettings",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getContactSettings(token);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to load contact information"),
      );
    }
  },
);

export const updateContactSettingsThunk = createAsyncThunk(
  "settings/updateContactSettings",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateContactSettings(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update contact information"),
      );
    }
  },
);

/* =========================================================
   LOCATION
========================================================= */

export const updateLocationPreferenceThunk = createAsyncThunk(
  "settings/updateLocationPreference",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: Record<string, unknown>;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateLocationPreference(token, data);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Failed to update location preference"),
      );
    }
  },
);

/* =========================================================
   LOGOUT
========================================================= */

export const logoutThunk = createAsyncThunk(
  "settings/logout",
  async (token: string, { rejectWithValue }) => {
    try {
      return await logoutUser(token);
    } catch (error) {
      return rejectWithValue(getErrorMessage(error, "Failed to log out"));
    }
  },
);
