import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  checkUsername,
  completeOnboarding,
  getContact,
  getCurrentUser,
  getPoints,
  registerDevice,
  updateAvatar,
  updateCategory,
  updateContact,
  updateFaction,
  updateInterests,
  updateLocationPreference,
  updateNotificationPreference,
  updateProfile,
  uploadAvatarPhoto,
} from "@/services/user";

// This file deliberately imports ONLY from services/user.ts — never from
// store.ts, userSlice.ts, or anything that could import either of those
// back. A thunk file importing something that eventually imports the
// slice that imports the thunk file is exactly what produces
// "Cannot read property 'pending' of undefined": the thunk is still
// undefined at the moment the slice's extraReducers run, because the
// module loading order got tangled. Keep it this way.

// ==========================================
// CURRENT USER
// GET /api/users/me
// ==========================================

export const fetchCurrentUser = createAsyncThunk(
  "user/fetchCurrentUser",
  async (email: string, { rejectWithValue }) => {
    try {
      return await getCurrentUser(email);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to get user",
      );
    }
  },
);

// ==========================================
// USERNAME CHECK
// GET /api/users/check-username
// ==========================================

export const checkUsernameThunk = createAsyncThunk(
  "user/checkUsername",
  async (
    {
      username,
      email,
    }: {
      username: string;
      email: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await checkUsername(username, email);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to check username",
      );
    }
  },
);

// ==========================================
// PROFILE
// PATCH /api/users/me/profile
// ==========================================

export const saveUserProfile = createAsyncThunk(
  "user/saveUserProfile",
  async (
    payload: {
      email: string;
      firstName: string;
      lastName: string;
      username: string;
      age: number;
      gender: string;
      bio?: string;
      // Optional: this runs during onboarding (pre-login, identified by
      // email — see CreateProfile.tsx) but the same thunk may also get
      // used post-login later, so token stays supported without being
      // required.
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateProfile(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update profile",
      );
    }
  },
);

// ==========================================
// CATEGORY
// PATCH /api/users/me/profile
// ==========================================

export const saveUserCategory = createAsyncThunk(
  "user/saveUserCategory",
  async (
    payload: {
      email: string;
      category: string;
      showCategoryOnProfile: boolean;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateCategory(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save category",
      );
    }
  },
);

// ==========================================
// AVATAR (preset)
// PATCH /api/users/me/avatar
// ==========================================

export const saveUserAvatar = createAsyncThunk(
  "user/saveUserAvatar",
  async (
    payload: {
      email: string;
      avatar: string;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateAvatar(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update avatar",
      );
    }
  },
);

// ==========================================
// AVATAR PHOTO (upload)
// POST /api/users/me/avatar/photo
// ==========================================

export const saveAvatarPhoto = createAsyncThunk(
  "user/saveAvatarPhoto",
  async (
    {
      email,
      photoUri,
      token,
    }: {
      email: string;
      photoUri: string;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await uploadAvatarPhoto(email, photoUri, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to upload profile photo",
      );
    }
  },
);

// ==========================================
// FACTION
// POST /api/users/me/faction
// ==========================================

export const saveUserFaction = createAsyncThunk(
  "user/saveUserFaction",
  async (
    payload: {
      email: string;
      factionKey: string;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateFaction(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update faction",
      );
    }
  },
);

// ==========================================
// INTERESTS
// PUT /api/users/me/interests
// ==========================================

export const saveUserInterests = createAsyncThunk(
  "user/saveUserInterests",
  async (
    payload: {
      email: string;
      interests: string[];
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateInterests(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update interests",
      );
    }
  },
);

// ==========================================
// NOTIFICATION PREFERENCE
// PATCH /api/users/me/preferences/notifications
// ==========================================

export const saveNotificationPreference = createAsyncThunk(
  "user/saveNotificationPreference",
  async (
    payload: {
      email: string;
      notificationsEnabled: boolean;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateNotificationPreference(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to update notification preference",
      );
    }
  },
);

// ==========================================
// LOCATION PREFERENCE
// PATCH /api/users/me/preferences/location
// ==========================================

export const saveLocationPreference = createAsyncThunk(
  "user/saveLocationPreference",
  async (
    payload: {
      email: string;
      locationEnabled: boolean;
      radiusMiles: number;
      lat: number;
      lng: number;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await updateLocationPreference(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to update location preference",
      );
    }
  },
);

// ==========================================
// CONTACT
// GET /api/users/me/contact
// ==========================================

export const fetchUserContact = createAsyncThunk(
  "user/fetchUserContact",
  async (
    {
      token,
    }: {
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getContact(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load contact",
      );
    }
  },
);

// PATCH /api/users/me/contact
export const saveUserContact = createAsyncThunk(
  "user/saveUserContact",
  async (
    {
      token,
      data,
    }: {
      token?: string;
      data: {
        email: string;
        phone: string;
        businessAddress: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateContact(token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save contact",
      );
    }
  },
);

// ==========================================
// DEVICE
// POST /api/users/me/devices
// ==========================================

export const registerUserDevice = createAsyncThunk(
  "user/registerDevice",
  async (
    payload: {
      email: string;
      pushToken: string;
      platform: string;
      token?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { token, ...data } = payload;
      return await registerDevice(data, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to register device",
      );
    }
  },
);

// ==========================================
// COMPLETE ONBOARDING
// POST /api/users/me/onboarding/complete
// ==========================================

export const finishOnboarding = createAsyncThunk(
  "user/finishOnboarding",
  async (payload: unknown, { rejectWithValue }) => {
    try {
      // No token here on purpose — the actual call site
      // (app/onboarding/ready.tsx) dispatches finishOnboarding(payload)
      // directly, with no wrapper and no token field. The backend's
      // completeOnboarding accepts an optional token but doesn't require
      // one — same email-based identification every other onboarding
      // step already relies on successfully.
      return await completeOnboarding(payload);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding",
      );
    }
  },
);

// ==========================================
// POINTS
// GET /api/users/me/points
// ==========================================

export const fetchUserPoints = createAsyncThunk(
  "user/fetchUserPoints",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getPoints(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load points",
      );
    }
  },
);
