import { getInterests } from "@/services/interests";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const fetchInterests = createAsyncThunk(
  "interest/fetchInterests",

  async (token: string, { rejectWithValue }) => {
    try {
      const response = await getInterests(token);

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load interests";

      return rejectWithValue(message);
    }
  },
);
