import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  exchangeGoogleCode,
  loginUser,
  registerUser,
} from "../thunks/authThunks";

type UserProfile = {
  firstName?: string;
  lastName?: string;
  username?: string;
  age?: number | null;
  gender?: string;
  bio?: string;
  category?: string | null;
  showCategoryOnProfile?: boolean;
  avatarKey?: string;
  avatarPhotoUrl?: string | null;
};

type UserContact = {
  email?: string;
  phone?: string;
  businessAddress?: string;
};

type User = {
  id: string;
  email: string;
  profile?: UserProfile;
  contact?: UserContact;
  faction: string | null;
  interests: string[];
  onboardingComplete: boolean;
};

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
};

type AuthUserUpdate = {
  profile?: Partial<UserProfile>;
  contact?: Partial<UserContact>;
  email?: string;
  faction?: string | null;
  interests?: string[];
  onboardingComplete?: boolean;
};

const initialState: AuthState = {
  token: null,
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
    },

    clearAuthError(state) {
      state.error = null;
    },

    updateAuthUser(state, action: PayloadAction<AuthUserUpdate>) {
      if (!state.user) {
        return;
      }

      const payload = action.payload;

      state.user = {
        ...state.user,
        ...payload,

        profile: payload.profile
          ? {
              ...(state.user.profile || {}),
              ...payload.profile,
            }
          : state.user.profile,

        contact: payload.contact
          ? {
              ...(state.user.contact || {}),
              ...payload.contact,
            }
          : state.user.contact,
      };
    },
  },

  extraReducers: (builder) => {
    builder.addCase(loginUser.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.loading = false;

      if (action.payload?.token && action.payload?.user) {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      } else {
        state.error = "Login response was incomplete.";
      }
    });

    builder.addCase(loginUser.rejected, (state, action) => {
      state.loading = false;

      state.error =
        typeof action.payload === "string" ? action.payload : "Login failed";
    });

    builder.addCase(registerUser.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(registerUser.fulfilled, (state, action) => {
      state.loading = false;

      if (action.payload?.token) {
        state.token = action.payload.token;
      }

      if (action.payload?.user) {
        state.user = action.payload.user;

        if (action.payload?.token) {
          state.isAuthenticated = true;
        }
      }

      state.error = null;
    });

    builder.addCase(registerUser.rejected, (state, action) => {
      state.loading = false;

      state.error =
        typeof action.payload === "string" ? action.payload : "Signup failed";
    });

    builder.addCase(exchangeGoogleCode.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(exchangeGoogleCode.fulfilled, (state, action) => {
      state.loading = false;

      state.token = action.payload.token;

      state.user = action.payload.user;

      state.isAuthenticated = true;

      state.error = null;
    });

    builder.addCase(exchangeGoogleCode.rejected, (state, action) => {
      state.loading = false;

      state.error =
        typeof action.payload === "string"
          ? action.payload
          : "Google authentication failed";
    });
  },
});

export const { logout, clearAuthError, updateAuthUser } = authSlice.actions;

export default authSlice.reducer;
