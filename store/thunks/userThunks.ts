import {
  completeOnboarding,
  getContact,
  getCurrentUser,
  getProfileCategories,
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

import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchCurrentUser = createAsyncThunk(
  "user/fetchCurrentUser",
  async (email: string, { rejectWithValue }) => {
    try {
      const response = await getCurrentUser(email);

      return response;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to get user",
      );
    }
  },
);

export const saveUserProfile = createAsyncThunk(
  "user/saveUserProfile",
  async (
    data: {
      email: string;
      firstName: string;
      lastName: string;
      username: string;
      age: number;
      gender: string;
      bio?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateProfile(data);

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";

      return rejectWithValue(message);
    }
  },
);

export const fetchProfileCategories = createAsyncThunk(
  "user/fetchProfileCategories",
  async (_unused: void, { rejectWithValue }) => {
    try {
      const response = await getProfileCategories();

      return response;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load categories",
      );
    }
  },
);

export const saveUserCategory = createAsyncThunk(
  "user/saveUserCategory",
  async (
    data: {
      email: string;
      category: string;
      showCategoryOnProfile: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateCategory(data);

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save category";

      return rejectWithValue(message);
    }
  },
);

export const saveUserAvatar = createAsyncThunk(
  "user/saveUserAvatar",
  async (
    data: {
      email: string;
      avatar: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateAvatar(data);

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update avatar";

      return rejectWithValue(message);
    }
  },
);

export const saveAvatarPhoto = createAsyncThunk(
  "user/saveAvatarPhoto",
  async (
    {
      email,
      photoUri,
    }: {
      email: string;
      photoUri: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await uploadAvatarPhoto(email, photoUri);

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to upload profile photo";

      return rejectWithValue(message);
    }
  },
);

export const saveUserInterests = createAsyncThunk(
  "user/saveUserInterests",
  async (
    {
      email,
      interests,
    }: {
      email: string;
      interests: string[];
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateInterests({
        email,
        interests,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save interests";

      return rejectWithValue(message);
    }
  },
);

export const saveUserFaction = createAsyncThunk(
  "user/saveUserFaction",
  async (
    {
      email,
      factionKey,
    }: {
      email: string;
      factionKey: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateFaction({
        email,
        factionKey,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save faction";

      return rejectWithValue(message);
    }
  },
);

export const fetchUserContact = createAsyncThunk(
  "user/fetchUserContact",
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await getContact(token);

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to get contact details";

      return rejectWithValue(message);
    }
  },
);

export const saveUserContact = createAsyncThunk(
  "user/saveUserContact",
  async (
    {
      token,
      email,
      phone,
      businessAddress,
    }: {
      token?: string;
      email: string;
      phone: string;
      businessAddress: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateContact(token, {
        email,
        phone,
        businessAddress,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save contact";

      return rejectWithValue(message);
    }
  },
);

export const saveNotificationPreference = createAsyncThunk(
  "user/saveNotificationPreference",
  async (
    {
      email,
      notificationsEnabled,
    }: {
      email: string;
      notificationsEnabled: boolean;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateNotificationPreference({
        email,
        notificationsEnabled,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save notification preference";

      return rejectWithValue(message);
    }
  },
);

export const saveLocationPreference = createAsyncThunk(
  "user/saveLocationPreference",
  async (
    {
      email,
      locationEnabled,
      radiusMiles,
      lat,
      lng,
    }: {
      email: string;
      locationEnabled: boolean;
      radiusMiles: number;
      lat: number | null;
      lng: number | null;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await updateLocationPreference({
        email,
        locationEnabled,
        radiusMiles,
        lat: lat ?? 0,
        lng: lng ?? 0,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save location preference";

      return rejectWithValue(message);
    }
  },
);

export const finishOnboarding = createAsyncThunk(
  "user/finishOnboarding",
  async (
    data: {
      email: string;

      profile: {
        firstName: string;
        lastName: string;
        username: string;
        age: number | null;
        gender: string;
        avatar: string;
      };

      faction: string;

      interests: string[];

      preferences: {
        notificationsEnabled: boolean;
      };

      location: {
        locationEnabled: boolean;
        radiusMiles: number;
        lat: number | null;
        lng: number | null;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await completeOnboarding(data);

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding";

      return rejectWithValue(message);
    }
  },
);
