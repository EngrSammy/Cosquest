// SHARE A POST TO YOUR FEED (like Facebook's "Share now"), with an optional
// caption. POST /api/posts/:postId/share-to-feed -> { post, originalPostId,
// shareCount }. The new post is added to the top of the feed (postSlice).
import { createAsyncThunk } from "@reduxjs/toolkit";

import { apiRequest } from "@/services/api";

export type ShareToFeedResult = {
  post: unknown;
  originalPostId?: string;
  shareCount?: number;
};

export const shareToFeedThunk = createAsyncThunk(
  "post/shareToFeed",
  async (
    {
      postId,
      token,
      content,
    }: {
      postId: string;
      token: string;
      content?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await apiRequest<ShareToFeedResult>(
        `/api/posts/${encodeURIComponent(postId)}/share-to-feed`,
        {
          method: "POST",
          token,
          body: { content: content?.trim() || "" },
        },
      );
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to share the post",
      );
    }
  },
);
