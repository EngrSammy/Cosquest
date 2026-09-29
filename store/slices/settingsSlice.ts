import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type {
      AppearanceSettings,
      BlockedUser,
      DataUsageSettings,
      HelpSettings,
      NotificationSettings,
      PrivacySettings,
      SettingsOverview,
} from "@/services/settings";

import {
      fetchAppearanceSettings,
      fetchBlockedUsers,
      fetchContactSettings,
      fetchDataUsageSettings,
      fetchHelpSettings,
      fetchNotificationSettings,
      fetchPrivacySettings,
      fetchSettings,
      logoutThunk,
      registerDeviceThunk,
      submitSupportRequest,
      updateAppearanceSettingsThunk,
      updateContactSettingsThunk,
      updateDataUsageSettingsThunk,
      updateLocationPreferenceThunk,
      updateNotificationSettingsThunk,
      updatePrivacySettingsThunk,
} from "../thunks/settingsThunks";

type SettingsState = {
  settings: SettingsOverview | null;

  privacy: PrivacySettings | null;
  blockedUsers: BlockedUser[];

  notifications: NotificationSettings | null;

  appearance: AppearanceSettings | null;

  dataUsage: DataUsageSettings | null;

  help: HelpSettings | null;

  contact: Record<string, unknown> | null;

  loading: boolean;

  privacyLoading: boolean;
  blockedUsersLoading: boolean;
  notificationsLoading: boolean;
  appearanceLoading: boolean;
  dataUsageLoading: boolean;
  helpLoading: boolean;
  contactLoading: boolean;

  savingPrivacy: boolean;
  savingNotifications: boolean;
  savingAppearance: boolean;
  savingDataUsage: boolean;
  savingContact: boolean;
  savingLocation: boolean;

  submittingSupportRequest: boolean;
  registeringDevice: boolean;
  loggingOut: boolean;

  error: string | null;
};

const initialState: SettingsState = {
  settings: null,

  privacy: null,
  blockedUsers: [],

  notifications: null,

  appearance: null,

  dataUsage: null,

  help: null,

  contact: null,

  loading: false,

  privacyLoading: false,
  blockedUsersLoading: false,
  notificationsLoading: false,
  appearanceLoading: false,
  dataUsageLoading: false,
  helpLoading: false,
  contactLoading: false,

  savingPrivacy: false,
  savingNotifications: false,
  savingAppearance: false,
  savingDataUsage: false,
  savingContact: false,
  savingLocation: false,

  submittingSupportRequest: false,
  registeringDevice: false,
  loggingOut: false,

  error: null,
};

const settingsSlice = createSlice({
  name: "settings",

  initialState,

  reducers: {
    clearSettingsError(state) {
      state.error = null;
    },

    clearSettings(state) {
      state.settings = null;
      state.privacy = null;
      state.blockedUsers = [];
      state.notifications = null;
      state.appearance = null;
      state.dataUsage = null;
      state.help = null;
      state.contact = null;
      state.error = null;
    },

    setPrivacyLocal(state, action: PayloadAction<Partial<PrivacySettings>>) {
      state.privacy = {
        ...(state.privacy || {}),
        ...action.payload,
      };
    },

    setNotificationLocal(
      state,
      action: PayloadAction<Partial<NotificationSettings>>,
    ) {
      state.notifications = {
        ...(state.notifications || {}),
        ...action.payload,
      };
    },

    setAppearanceLocal(
      state,
      action: PayloadAction<Partial<AppearanceSettings>>,
    ) {
      state.appearance = {
        ...(state.appearance || {}),
        ...action.payload,
      };
    },

    setDataUsageLocal(
      state,
      action: PayloadAction<Partial<DataUsageSettings>>,
    ) {
      state.dataUsage = {
        ...(state.dataUsage || {}),
        ...action.payload,
      };
    },
  },

  extraReducers: (builder) => {
    /* =====================================================
       SETTINGS
    ===================================================== */

    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
      })

      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || "Failed to load settings";
      });

    /* =====================================================
       PRIVACY
    ===================================================== */

    builder
      .addCase(fetchPrivacySettings.pending, (state) => {
        state.privacyLoading = true;
        state.error = null;
      })

      .addCase(fetchPrivacySettings.fulfilled, (state, action) => {
        state.privacyLoading = false;
        state.privacy = action.payload;
      })

      .addCase(fetchPrivacySettings.rejected, (state, action) => {
        state.privacyLoading = false;
        state.error =
          (action.payload as string) || "Failed to load privacy settings";
      })

      .addCase(updatePrivacySettingsThunk.pending, (state) => {
        state.savingPrivacy = true;
        state.error = null;
      })

      .addCase(updatePrivacySettingsThunk.fulfilled, (state, action) => {
        state.savingPrivacy = false;

        state.privacy = {
          ...(state.privacy || {}),
          ...action.payload,
        };
      })

      .addCase(updatePrivacySettingsThunk.rejected, (state, action) => {
        state.savingPrivacy = false;
        state.error =
          (action.payload as string) || "Failed to update privacy settings";
      });

    /* =====================================================
       BLOCKED USERS
    ===================================================== */

    builder
      .addCase(fetchBlockedUsers.pending, (state) => {
        state.blockedUsersLoading = true;
        state.error = null;
      })

      .addCase(fetchBlockedUsers.fulfilled, (state, action) => {
        state.blockedUsersLoading = false;
        state.blockedUsers = action.payload || [];
      })

      .addCase(fetchBlockedUsers.rejected, (state, action) => {
        state.blockedUsersLoading = false;
        state.error =
          (action.payload as string) || "Failed to load blocked users";
      });

    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    builder
      .addCase(fetchNotificationSettings.pending, (state) => {
        state.notificationsLoading = true;
        state.error = null;
      })

      .addCase(fetchNotificationSettings.fulfilled, (state, action) => {
        state.notificationsLoading = false;
        state.notifications = action.payload;
      })

      .addCase(fetchNotificationSettings.rejected, (state, action) => {
        state.notificationsLoading = false;
        state.error =
          (action.payload as string) || "Failed to load notification settings";
      })

      .addCase(updateNotificationSettingsThunk.pending, (state) => {
        state.savingNotifications = true;
        state.error = null;
      })

      .addCase(updateNotificationSettingsThunk.fulfilled, (state, action) => {
        state.savingNotifications = false;

        state.notifications = {
          ...(state.notifications || {}),
          ...action.payload,
        };
      })

      .addCase(updateNotificationSettingsThunk.rejected, (state, action) => {
        state.savingNotifications = false;
        state.error =
          (action.payload as string) ||
          "Failed to update notification settings";
      });

    /* =====================================================
       APPEARANCE
    ===================================================== */

    builder
      .addCase(fetchAppearanceSettings.pending, (state) => {
        state.appearanceLoading = true;
        state.error = null;
      })

      .addCase(fetchAppearanceSettings.fulfilled, (state, action) => {
        state.appearanceLoading = false;
        state.appearance = action.payload;
      })

      .addCase(fetchAppearanceSettings.rejected, (state, action) => {
        state.appearanceLoading = false;
        state.error =
          (action.payload as string) || "Failed to load appearance settings";
      })

      .addCase(updateAppearanceSettingsThunk.pending, (state) => {
        state.savingAppearance = true;
        state.error = null;
      })

      .addCase(updateAppearanceSettingsThunk.fulfilled, (state, action) => {
        state.savingAppearance = false;

        state.appearance = {
          ...(state.appearance || {}),
          ...action.payload,
        };
      })

      .addCase(updateAppearanceSettingsThunk.rejected, (state, action) => {
        state.savingAppearance = false;
        state.error =
          (action.payload as string) || "Failed to update appearance settings";
      });

    /* =====================================================
       DATA USAGE
    ===================================================== */

    builder
      .addCase(fetchDataUsageSettings.pending, (state) => {
        state.dataUsageLoading = true;
        state.error = null;
      })

      .addCase(fetchDataUsageSettings.fulfilled, (state, action) => {
        state.dataUsageLoading = false;
        state.dataUsage = action.payload;
      })

      .addCase(fetchDataUsageSettings.rejected, (state, action) => {
        state.dataUsageLoading = false;
        state.error =
          (action.payload as string) || "Failed to load data usage settings";
      })

      .addCase(updateDataUsageSettingsThunk.pending, (state) => {
        state.savingDataUsage = true;
        state.error = null;
      })

      .addCase(updateDataUsageSettingsThunk.fulfilled, (state, action) => {
        state.savingDataUsage = false;

        state.dataUsage = {
          ...(state.dataUsage || {}),
          ...action.payload,
        };
      })

      .addCase(updateDataUsageSettingsThunk.rejected, (state, action) => {
        state.savingDataUsage = false;
        state.error =
          (action.payload as string) || "Failed to update data usage settings";
      });

    /* =====================================================
       HELP
    ===================================================== */

    builder
      .addCase(fetchHelpSettings.pending, (state) => {
        state.helpLoading = true;
        state.error = null;
      })

      .addCase(fetchHelpSettings.fulfilled, (state, action) => {
        state.helpLoading = false;
        state.help = action.payload;
      })

      .addCase(fetchHelpSettings.rejected, (state, action) => {
        state.helpLoading = false;
        state.error =
          (action.payload as string) || "Failed to load help information";
      });

    /* =====================================================
       SUPPORT REQUEST
    ===================================================== */

    builder
      .addCase(submitSupportRequest.pending, (state) => {
        state.submittingSupportRequest = true;
        state.error = null;
      })

      .addCase(submitSupportRequest.fulfilled, (state) => {
        state.submittingSupportRequest = false;
      })

      .addCase(submitSupportRequest.rejected, (state, action) => {
        state.submittingSupportRequest = false;
        state.error =
          (action.payload as string) || "Failed to submit support request";
      });

    /* =====================================================
       DEVICE
    ===================================================== */

    builder
      .addCase(registerDeviceThunk.pending, (state) => {
        state.registeringDevice = true;
        state.error = null;
      })

      .addCase(registerDeviceThunk.fulfilled, (state) => {
        state.registeringDevice = false;
      })

      .addCase(registerDeviceThunk.rejected, (state, action) => {
        state.registeringDevice = false;
        state.error = (action.payload as string) || "Failed to register device";
      });

    /* =====================================================
       CONTACT
    ===================================================== */

    builder
      .addCase(fetchContactSettings.pending, (state) => {
        state.contactLoading = true;
        state.error = null;
      })

      .addCase(fetchContactSettings.fulfilled, (state, action) => {
        state.contactLoading = false;
        state.contact = action.payload;
      })

      .addCase(fetchContactSettings.rejected, (state, action) => {
        state.contactLoading = false;
        state.error =
          (action.payload as string) || "Failed to load contact information";
      })

      .addCase(updateContactSettingsThunk.pending, (state) => {
        state.savingContact = true;
        state.error = null;
      })

      .addCase(updateContactSettingsThunk.fulfilled, (state, action) => {
        state.savingContact = false;

        state.contact = {
          ...(state.contact || {}),
          ...action.payload,
        };
      })

      .addCase(updateContactSettingsThunk.rejected, (state, action) => {
        state.savingContact = false;
        state.error =
          (action.payload as string) || "Failed to update contact information";
      });

    /* =====================================================
       LOCATION
    ===================================================== */

    builder
      .addCase(updateLocationPreferenceThunk.pending, (state) => {
        state.savingLocation = true;
        state.error = null;
      })

      .addCase(updateLocationPreferenceThunk.fulfilled, (state) => {
        state.savingLocation = false;
      })

      .addCase(updateLocationPreferenceThunk.rejected, (state, action) => {
        state.savingLocation = false;
        state.error =
          (action.payload as string) || "Failed to update location preference";
      });

    /* =====================================================
       LOGOUT
    ===================================================== */

    builder
      .addCase(logoutThunk.pending, (state) => {
        state.loggingOut = true;
        state.error = null;
      })

      .addCase(logoutThunk.fulfilled, (state) => {
        state.loggingOut = false;

        state.settings = null;
        state.privacy = null;
        state.blockedUsers = [];
        state.notifications = null;
        state.appearance = null;
        state.dataUsage = null;
        state.help = null;
        state.contact = null;
      })

      .addCase(logoutThunk.rejected, (state, action) => {
        state.loggingOut = false;
        state.error = (action.payload as string) || "Failed to log out";
      });
  },
});

export const {
  clearSettingsError,
  clearSettings,
  setPrivacyLocal,
  setNotificationLocal,
  setAppearanceLocal,
  setDataUsageLocal,
} = settingsSlice.actions;

export default settingsSlice.reducer;
