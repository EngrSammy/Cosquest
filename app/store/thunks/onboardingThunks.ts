import {
  completeOnboarding,
  registerDevice,
  updateFaction,
  updateInterests,
  updateLocation,
  updateNotifications,
} from "@/services/onboarding";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const saveFaction = createAsyncThunk(
  "onboarding/saveFaction",
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
      return await updateFaction(email, factionKey);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save faction",
      );
    }
  },
);

export const saveInterests = createAsyncThunk(
  "onboarding/saveInterests",
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
      return await updateInterests(email, interests);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save interests",
      );
    }
  },
);

export const saveNotificationPreference = createAsyncThunk(
  "onboarding/saveNotificationPreference",
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
      return await updateNotifications(email, notificationsEnabled);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to save notification preference",
      );
    }
  },
);

export const saveLocationPreference = createAsyncThunk(
  "onboarding/saveLocationPreference",
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
      lat: number;
      lng: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateLocation(
        email,
        locationEnabled,
        radiusMiles,
        lat,
        lng,
      );
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to save location",
      );
    }
  },
);

export const saveDevice = createAsyncThunk(
  "onboarding/saveDevice",
  async (
    {
      email,
      pushToken,
      platform,
    }: {
      email: string;
      pushToken: string;
      platform: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await registerDevice(email, pushToken, platform);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to register device",
      );
    }
  },
);

export const finishOnboarding = createAsyncThunk(
  "onboarding/finishOnboarding",
  async (data: unknown, { rejectWithValue }) => {
    try {
      return await completeOnboarding(data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding",
      );
    }
  },
);
