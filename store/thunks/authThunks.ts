import { apiRequest } from "@/services/api";
import { exchangeGoogleOAuthCode, signIn, signUp } from "@/services/auth";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (
    {
      emailOrUsername,
      password,
    }: {
      emailOrUsername: string;
      password: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await signIn(emailOrUsername, password);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";

      return rejectWithValue(message);
    }
  },
);

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (
    {
      email,
      password,
      confirmPassword,
    }: {
      email: string;
      password: string;
      confirmPassword: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const response = await signUp(email, password, confirmPassword);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup failed";

      return rejectWithValue(message);
    }
  },
);

type GoogleUser = {
  id: string;
  email: string;
  profile?: {
    firstName?: string;
    lastName?: string;
    username?: string;
    age?: number | null;
    gender?: string;
    avatarKey?: string;
    avatarPhotoUrl?: string | null;
  };
  faction: string | null;
  interests: string[];
  onboardingComplete: boolean;
};

export const exchangeGoogleCode = createAsyncThunk(
  "auth/exchangeGoogleCode",
  async (oauthCode: string, { rejectWithValue }) => {
    try {
      const oauthResponse = await exchangeGoogleOAuthCode(oauthCode);

      const userResponse = await apiRequest<{ user: GoogleUser }>(
        "/api/users/me",
        {
          method: "GET",
          token: oauthResponse.token,
        },
      );

      return {
        ...oauthResponse,
        user: userResponse.user,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google authentication failed";

      return rejectWithValue(message);
    }
  },
);
