import { createSlice } from "@reduxjs/toolkit";
import { loginUser, registerUser } from "../thunks/authThunks";

type User = {
  id: string;
  email: string;
  profile?: {
    firstName: string;
    lastName: string;
    username: string;
    age: number | null;
    gender: string;
    avatarKey: string;
    avatarPhotoUrl: string | null;
  };
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
  },

  extraReducers: (builder) => {
    builder

      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;

        if (action.payload?.token) {
          state.token = action.payload.token;
        }

        if (action.payload?.user) {
          state.user = action.payload.user;
          state.isAuthenticated = true;
        }

        state.error = null;
      })

      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string" ? action.payload : "Login failed";
      })

      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;

        if (action.payload?.token) {
          state.token = action.payload.token;
        }

        if (action.payload?.user) {
          state.user = action.payload.user;
          state.isAuthenticated = true;
        }

        state.error = null;
      })

      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string" ? action.payload : "Signup failed";
      });
  },
});

export const { logout, clearAuthError } = authSlice.actions;

export default authSlice.reducer;
