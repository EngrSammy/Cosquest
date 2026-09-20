import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  fetchCurrentUser,
  fetchUserContact,
  saveAvatarPhoto,
  saveUserAvatar,
  saveUserCategory,
  saveUserContact,
  saveUserProfile,
} from "../thunks/userThunks";

type User = {
  email?: string;

  firstName?: string;
  lastName?: string;
  username?: string;
  age?: number | null;
  gender?: string;

  bio?: string;

  category?: string | null;
  showCategoryOnProfile?: boolean;

  avatar?: string;
  photo?: string;

  faction?: string;
  interests?: string[];

  profile?: {
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

  contact?: {
    email?: string;
    phone?: string;
    businessAddress?: string;
  };

  preferences?: {
    notificationsEnabled?: boolean;
    locationEnabled?: boolean;
    radiusMiles?: number;
  };

  location?: {
    lat?: number | null;
    lng?: number | null;
    updatedAt?: string | null;
  };
};

type UserState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

const initialState: UserState = {
  user: null,
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",

  initialState,

  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.error = null;
    },

    updateUser(state, action: PayloadAction<Partial<User>>) {
      if (!state.user) {
        return;
      }

      state.user = {
        ...state.user,
        ...action.payload,

        profile: action.payload.profile
          ? {
              ...(state.user.profile || {}),
              ...action.payload.profile,
            }
          : state.user.profile,

        contact: action.payload.contact
          ? {
              ...(state.user.contact || {}),
              ...action.payload.contact,
            }
          : state.user.contact,
      };
    },

    clearUser(state) {
      state.user = null;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(fetchCurrentUser.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(fetchCurrentUser.fulfilled, (state, action) => {
      state.loading = false;
      state.error = null;
      state.user = action.payload;
    });

    builder.addCase(fetchCurrentUser.rejected, (state, action) => {
      state.loading = false;

      state.error = (action.payload as string) || "Failed to get user";
    });

    builder.addCase(saveUserProfile.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(saveUserProfile.fulfilled, (state, action) => {
      state.loading = false;
      state.error = null;

      if (!state.user) {
        return;
      }

      const response = action.payload as any;

      const updatedUser = response?.user || response;

      state.user = {
        ...state.user,
        ...updatedUser,

        profile: {
          ...(state.user.profile || {}),
          ...(updatedUser?.profile || {}),
        },
      };
    });

    builder.addCase(saveUserProfile.rejected, (state, action) => {
      state.loading = false;

      state.error = (action.payload as string) || "Failed to update profile";
    });

    builder.addCase(saveUserCategory.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(saveUserCategory.fulfilled, (state, action) => {
      state.loading = false;
      state.error = null;

      if (!state.user) {
        return;
      }

      const response = action.payload as any;

      const updatedUser = response?.user || response;

      state.user = {
        ...state.user,
        ...updatedUser,

        profile: {
          ...(state.user.profile || {}),
          ...(updatedUser?.profile || {}),
        },
      };
    });

    builder.addCase(saveUserCategory.rejected, (state, action) => {
      state.loading = false;

      state.error = (action.payload as string) || "Failed to save category";
    });

    builder.addCase(fetchUserContact.fulfilled, (state, action) => {
      if (!state.user) {
        return;
      }

      state.user = {
        ...state.user,

        contact: {
          ...(state.user.contact || {}),
          ...(action.payload?.contact || {}),
        },
      };
    });

    builder.addCase(saveUserContact.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(saveUserContact.fulfilled, (state, action) => {
      state.loading = false;
      state.error = null;

      if (!state.user) {
        return;
      }

      state.user = {
        ...state.user,

        contact: {
          ...(state.user.contact || {}),
          ...(action.payload?.contact || {}),
        },
      };
    });

    builder.addCase(saveUserContact.rejected, (state, action) => {
      state.loading = false;

      state.error = (action.payload as string) || "Failed to save contact";
    });

    builder.addCase(saveUserAvatar.fulfilled, (state, action) => {
      if (!state.user || !action.payload) {
        return;
      }

      const response = action.payload as any;

      const updatedUser = response?.user || response;

      state.user = {
        ...state.user,
        ...updatedUser,

        profile: {
          ...(state.user.profile || {}),
          ...(updatedUser?.profile || {}),
        },
      };
    });

    builder.addCase(saveAvatarPhoto.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(saveAvatarPhoto.fulfilled, (state, action) => {
      state.loading = false;
      state.error = null;

      if (!state.user) {
        return;
      }

      const response = action.payload as any;

      const updatedUser = response?.user || response;

      state.user = {
        ...state.user,
        ...updatedUser,

        profile: {
          ...(state.user.profile || {}),
          ...(updatedUser?.profile || {}),
        },
      };
    });

    builder.addCase(saveAvatarPhoto.rejected, (state, action) => {
      state.loading = false;

      state.error =
        (action.payload as string) || "Failed to upload profile photo";
    });
  },
});

export const { setUser, updateUser, clearUser } = userSlice.actions;

export default userSlice.reducer;
