import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  exchangeGoogleCode,
  loginUser,
  registerUser,
  resetPasswordThunk,
} from "../thunks/authThunks";

import { finishOnboarding } from "../thunks/userThunks";

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

    // ======================================
    // RESET PASSWORD
    // ======================================
    // reset-password returns the same { token, user } as login, so the
    // user is signed straight in — no trip back to the login screen.
    // The reset screen shows its own error messages, so errors aren't
    // stored here (that would also show up on the Sign In screen).

    builder.addCase(resetPasswordThunk.pending, (state) => {
      state.loading = true;
    });

    builder.addCase(resetPasswordThunk.fulfilled, (state, action) => {
      state.loading = false;

      if (action.payload?.token && action.payload?.user) {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      }
    });

    builder.addCase(resetPasswordThunk.rejected, (state) => {
      state.loading = false;
    });

    // ======================================
    // FINISH ONBOARDING
    // ======================================
    // registerUser.fulfilled above only conditionally sets a token
    // ("if action.payload?.token") — meaning signup doesn't necessarily
    // hand back a usable session up front, which matches the app's own
    // behavior: every onboarding step in between (profile, avatar,
    // faction, interests, notifications, location) has been running on
    // email-based identification with state.auth.token empty the whole
    // time. If the backend issues a real session token at the point
    // onboarding actually completes (the natural place to "activate"
    // a full account), this is the only place that ever stores it —
    // finishOnboarding lives in userThunks and, before this, nothing
    // wired its result back into the auth slice at all, so the token
    // would be silently dropped even if the backend sent one.
    // Defensive the same way registerUser.fulfilled is: does nothing if
    // the response has no token, so this is safe either way.
    builder.addCase(finishOnboarding.fulfilled, (state, action) => {
      const payload = action.payload as
        | {
            token?: string;
            user?: User;
          }
        | undefined;

      if (payload?.token) {
        state.token = payload.token;
        state.isAuthenticated = true;
        state.error = null;
      }

      if (payload?.user) {
        state.user = payload.user;
      }
    });
  },
});

export const { logout, clearAuthError, updateAuthUser } = authSlice.actions;

export default authSlice.reducer;
