import { configureStore } from "@reduxjs/toolkit";

import authReducer from "./slices/authSlice";
import callReducer from "./slices/callSlice";
import chatReducer from "./slices/chatSlice";
import factionReducer from "./slices/factionSlice";
import followReducer from "./slices/followSlice";
import interestReducer from "./slices/interestSlice";
import notificationReducer from "./slices/notificationSlice";
import onboardingReducer from "./slices/onboardingSlice";
import postReducer from "./slices/postSlice";
import profileReducer from "./slices/profileSlice";
import questReducer from "./slices/questSlice";
import settingsReducer from "./slices/settingsSlice";
import spotlightReducer from "./slices/spotlightSlice";
import userReducer from "./slices/userSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    onboarding: onboardingReducer,
    faction: factionReducer,
    interest: interestReducer,
    quest: questReducer,
    post: postReducer,
    chat: chatReducer,
    call: callReducer,
    notification: notificationReducer,
    follow: followReducer,
    profile: profileReducer,
    spotlight: spotlightReducer,
    settings: settingsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
