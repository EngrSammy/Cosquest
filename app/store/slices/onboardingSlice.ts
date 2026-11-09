import { createSlice } from "@reduxjs/toolkit";
import {
  finishOnboarding,
  saveFaction,
  saveInterests,
  saveLocationPreference,
  saveNotificationPreference,
} from "../thunks/onboardingThunks";

type OnboardingData = {
  firstName: string;
  lastName: string;
  username: string;
  age: number | null;
  gender: string;
  avatar: string;
  photo?: string;
  interests: string[];
  faction: string;
  radiusMi: number;
  locationGranted: boolean;
  lat: number | null;
  lng: number | null;
  notificationsEnabled: boolean;
};

type OnboardingState = {
  data: OnboardingData;
  loading: boolean;
  error: string | null;
  completed: boolean;
};

const initialState: OnboardingState = {
  data: {
    firstName: "",
    lastName: "",
    username: "",
    age: null,
    gender: "",
    avatar: "",
    photo: "",
    interests: [],
    faction: "",
    radiusMi: 10,
    locationGranted: false,
    lat: null,
    lng: null,
    notificationsEnabled: false,
  },
  loading: false,
  error: null,
  completed: false,
};

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState,

  reducers: {
    updateOnboarding(state, action) {
      state.data = {
        ...state.data,
        ...action.payload,
      };
    },

    setOnboardingLoading(state, action) {
      state.loading = action.payload;
    },

    setOnboardingError(state, action) {
      state.error = action.payload;
    },

    setOnboardingCompleted(state, action) {
      state.completed = action.payload;
    },

    resetOnboarding(state) {
      state.data = initialState.data;
      state.loading = false;
      state.error = null;
      state.completed = false;
    },
  },

  extraReducers: (builder) => {
    builder

      .addCase(saveFaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveFaction.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(saveFaction.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to save faction";
      })

      .addCase(saveInterests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveInterests.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(saveInterests.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to save interests";
      })

      .addCase(saveNotificationPreference.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveNotificationPreference.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(saveNotificationPreference.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to save notification preference";
      })

      .addCase(saveLocationPreference.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveLocationPreference.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(saveLocationPreference.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to save location";
      })

      .addCase(finishOnboarding.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(finishOnboarding.fulfilled, (state) => {
        state.loading = false;
        state.completed = true;
        state.error = null;
      })
      .addCase(finishOnboarding.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to complete onboarding";
      });
  },
});

export const {
  updateOnboarding,
  setOnboardingLoading,
  setOnboardingError,
  setOnboardingCompleted,
  resetOnboarding,
} = onboardingSlice.actions;

export default onboardingSlice.reducer;
