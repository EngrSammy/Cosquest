import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  bookmarkPostThunk,
  createImagePostThunk,
  createNewPost,
  createReelPostThunk,
  editPost,
  fetchPost,
  fetchPosts,
  likePostThunk,
  removeBookmarkThunk,
  removePost,
  sharePostThunk,
  unlikePostThunk,
} from "../thunks/postThunks";
import { shareToFeedThunk } from "../thunks/shareToFeedThunk";

// The author as the backend sends it (kept so cards can show the real name,
// avatar and faction).
export type PostAuthor = {
  id?: string;
  username?: string;
  name?: string;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
  faction?: string | null;
};

export type PostMediaItem = {
  url: string;
  resourceType?: string;
  width?: number | null;
  height?: number | null;
};

// The original post inside a shared post. `unavailable` when it was deleted.
export type SharedPost =
  | { unavailable: true }
  | {
      unavailable?: false;
      id: string;
      type?: "thought" | "image" | "reel";
      content?: string;
      image?: string | null;
      media?: PostMediaItem[];
      author?: PostAuthor;
      likes?: number;
      comments?: number;
      shares?: number;
      createdAt?: string;
      time?: string;
    };

export type Post = {
  id: string;

  // "share" = this post shares another post (see sharedPost).
  type?: "thought" | "image" | "reel" | "share";

  content?: string;

  image?: string | null;

  // Every photo/video of the post (the first one is also in `image`).
  media?: PostMediaItem[];

  avatar?: string | null;

  username?: string;
  handle?: string;

  userId?: string;

  author?: PostAuthor;

  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;

  liked?: boolean;
  bookmarked?: boolean;

  hashtags?: string[];

  createdAt?: string;
  time?: string;

  // For type "share": the original post.
  sharedPost?: SharedPost | null;
};

type PostState = {
  posts: Post[];
  selectedPost: Post | null;
  loading: boolean;
  error: string | null;
};

const initialState: PostState = {
  posts: [],
  selectedPost: null,
  loading: false,
  error: null,
};

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function extractPosts(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  if (Array.isArray(payload.posts)) {
    return payload.posts;
  }

  if (isObject(payload.data) && Array.isArray(payload.data.posts)) {
    return payload.data.posts;
  }

  if (isObject(payload.result) && Array.isArray(payload.result.posts)) {
    return payload.result.posts;
  }

  if (isObject(payload.post)) {
    return [payload.post];
  }

  if (isObject(payload.data) && isObject(payload.data.post)) {
    return [payload.data.post];
  }

  return [];
}

function extractMediaUrl(raw: Record<string, any>) {
  if (typeof raw.image === "string") {
    return raw.image;
  }

  if (typeof raw.imageUrl === "string") {
    return raw.imageUrl;
  }

  if (typeof raw.mediaUrl === "string") {
    return raw.mediaUrl;
  }

  if (Array.isArray(raw.media)) {
    const firstMedia = raw.media[0];

    if (typeof firstMedia === "string") {
      return firstMedia;
    }

    if (isObject(firstMedia)) {
      if (typeof firstMedia.url === "string") {
        return firstMedia.url;
      }

      if (typeof firstMedia.imageUrl === "string") {
        return firstMedia.imageUrl;
      }

      if (typeof firstMedia.mediaUrl === "string") {
        return firstMedia.mediaUrl;
      }
    }
  }

  return null;
}

// Every media item with a URL (keeps galleries and photo sizes).
function extractMedia(raw: Record<string, any>): PostMediaItem[] {
  if (!Array.isArray(raw.media)) {
    return [];
  }

  return raw.media
    .map((item: unknown) => {
      if (typeof item === "string") {
        return { url: item };
      }

      if (isObject(item) && typeof item.url === "string") {
        return {
          url: item.url,
          resourceType: item.resourceType,
          width: item.width ?? null,
          height: item.height ?? null,
        };
      }

      return null;
    })
    .filter(Boolean) as PostMediaItem[];
}

function extractAuthor(raw: Record<string, any>): PostAuthor | undefined {
  const author = isObject(raw.author)
    ? raw.author
    : isObject(raw.user)
      ? raw.user
      : null;

  if (!author) {
    return undefined;
  }

  return {
    id: author.id !== undefined ? String(author.id) : undefined,
    username: author.username,
    name: author.name,
    avatarKey: author.avatarKey ?? null,
    avatarPhotoUrl: author.avatarPhotoUrl ?? null,
    faction: author.faction ?? null,
  };
}

function formatTime(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d`;
  }

  return date.toLocaleDateString();
}

function normalizeSharedPost(raw: unknown): SharedPost | null {
  if (!isObject(raw)) {
    return null;
  }

  if (raw.unavailable) {
    return { unavailable: true };
  }

  const id = String(raw.id ?? "");

  if (!id) {
    return { unavailable: true };
  }

  const createdAt =
    typeof raw.createdAt === "string" ? raw.createdAt : undefined;

  return {
    id,
    type:
      raw.type === "image" || raw.type === "reel" || raw.type === "thought"
        ? raw.type
        : undefined,
    content: typeof raw.content === "string" ? raw.content : "",
    image: extractMediaUrl(raw),
    media: extractMedia(raw),
    author: extractAuthor(raw),
    likes: Number(raw.likeCount ?? raw.likes ?? 0),
    comments: Number(raw.commentCount ?? raw.comments ?? 0),
    shares: Number(raw.shareCount ?? raw.shares ?? 0),
    createdAt,
    time: formatTime(createdAt),
  };
}

function normalizePost(raw: unknown): Post | null {
  if (!isObject(raw)) {
    return null;
  }

  const author = isObject(raw.author)
    ? raw.author
    : isObject(raw.user)
      ? raw.user
      : {};

  const id = String(raw.id ?? "");

  if (!id) {
    return null;
  }

  const username = String(raw.username ?? raw.handle ?? author.username ?? "");

  const handle = username
    ? username.startsWith("@")
      ? username
      : `@${username}`
    : "";

  const createdAt =
    typeof raw.createdAt === "string" ? raw.createdAt : undefined;

  const content = typeof raw.content === "string" ? raw.content : "";

  let hashtags: string[] = [];

  if (Array.isArray(raw.hashtags)) {
    hashtags = raw.hashtags
      .map((item) => String(item).replace(/^#/, ""))
      .filter(Boolean);
  }

  const image = extractMediaUrl(raw);

  const avatar =
    typeof raw.avatarPhotoUrl === "string"
      ? raw.avatarPhotoUrl
      : typeof raw.avatarUrl === "string"
        ? raw.avatarUrl
        : typeof author.avatarPhotoUrl === "string"
          ? author.avatarPhotoUrl
          : typeof author.avatarUrl === "string"
            ? author.avatarUrl
            : null;

  const liked =
    typeof raw.liked === "boolean"
      ? raw.liked
      : typeof raw.likedByMe === "boolean"
        ? raw.likedByMe
        : false;

  const bookmarked =
    typeof raw.bookmarked === "boolean"
      ? raw.bookmarked
      : typeof raw.bookmarkedByMe === "boolean"
        ? raw.bookmarkedByMe
        : false;

  const type =
    raw.type === "image" ||
    raw.type === "reel" ||
    raw.type === "thought" ||
    raw.type === "share"
      ? raw.type
      : undefined;

  return {
    id,

    type,

    content,

    image,

    media: extractMedia(raw),

    avatar,

    username,

    handle,

    userId:
      raw.userId !== undefined
        ? String(raw.userId)
        : author.id !== undefined
          ? String(author.id)
          : undefined,

    author: extractAuthor(raw),

    likes: Number(raw.likeCount ?? raw.likes ?? 0),

    comments: Number(raw.commentCount ?? raw.comments ?? 0),

    shares: Number(raw.shareCount ?? raw.shares ?? 0),

    saves: Number(raw.bookmarkCount ?? raw.saves ?? 0),

    liked,

    bookmarked,

    hashtags,

    createdAt,

    time: formatTime(createdAt),

    sharedPost:
      type === "share"
        ? normalizeSharedPost(raw.sharedPost) || { unavailable: true }
        : null,
  };
}

function normalizePosts(payload: unknown): Post[] {
  return extractPosts(payload)
    .map(normalizePost)
    .filter((post): post is Post => post !== null);
}

function addCreatedPost(state: PostState, payload: unknown) {
  const normalized = normalizePosts(payload);

  if (normalized.length > 0) {
    state.posts.unshift(normalized[0]);
  }
}

const postSlice = createSlice({
  name: "post",

  initialState,

  reducers: {
    setSelectedPost(state, action: PayloadAction<Post>) {
      state.selectedPost = action.payload;
    },

    clearSelectedPost(state) {
      state.selectedPost = null;
    },

    clearPosts(state) {
      state.posts = [];
      state.selectedPost = null;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // FETCH POSTS
      .addCase(fetchPosts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;

        state.posts = normalizePosts(action.payload);
      })

      .addCase(fetchPosts.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load posts";
      })

      // CREATE THOUGHT
      .addCase(createNewPost.fulfilled, (state, action) => {
        addCreatedPost(state, action.payload);
      })

      // CREATE IMAGE
      .addCase(createImagePostThunk.fulfilled, (state, action) => {
        addCreatedPost(state, action.payload);
      })

      // CREATE REEL
      .addCase(createReelPostThunk.fulfilled, (state, action) => {
        addCreatedPost(state, action.payload);
      })

      // SHARE TO FEED: the new shared post goes on top, and the original's
      // share count updates straight away.
      .addCase(shareToFeedThunk.fulfilled, (state, action) => {
        addCreatedPost(state, action.payload);

        const { originalPostId, shareCount } = action.payload || {};

        if (originalPostId && typeof shareCount === "number") {
          state.posts.forEach((post) => {
            if (post.id === originalPostId) {
              post.shares = shareCount;
            }

            if (
              post.sharedPost &&
              !post.sharedPost.unavailable &&
              post.sharedPost.id === originalPostId
            ) {
              post.sharedPost.shares = shareCount;
            }
          });
        }
      })

      // FETCH SINGLE POST
      .addCase(fetchPost.fulfilled, (state, action) => {
        const posts = normalizePosts(action.payload);

        if (posts.length > 0) {
          state.selectedPost = posts[0];
        }
      })

      // EDIT POST
      .addCase(editPost.fulfilled, (state, action) => {
        const posts = normalizePosts(action.payload);

        if (posts.length === 0) {
          return;
        }

        const updatedPost = posts[0];

        const index = state.posts.findIndex(
          (post) => post.id === updatedPost.id,
        );

        if (index !== -1) {
          state.posts[index] = updatedPost;
        }

        if (state.selectedPost?.id === updatedPost.id) {
          state.selectedPost = updatedPost;
        }
      })

      // DELETE POST
      .addCase(removePost.fulfilled, (state, action) => {
        const postId = String(action.payload);

        state.posts = state.posts.filter((post) => post.id !== postId);

        if (state.selectedPost?.id === postId) {
          state.selectedPost = null;
        }
      })

      // LIKE
      .addCase(likePostThunk.fulfilled, (state, action) => {
        const postId = action.meta.arg.postId;

        const post = state.posts.find((item) => item.id === postId);

        if (post) {
          post.liked = true;

          post.likes = (post.likes ?? 0) + 1;
        }
      })

      // UNLIKE
      .addCase(unlikePostThunk.fulfilled, (state, action) => {
        const postId = action.meta.arg.postId;

        const post = state.posts.find((item) => item.id === postId);

        if (post) {
          post.liked = false;

          post.likes = Math.max(0, (post.likes ?? 0) - 1);
        }
      })

      // SHARE
      .addCase(sharePostThunk.fulfilled, (state, action) => {
        const postId = action.meta.arg.postId;

        const post = state.posts.find((item) => item.id === postId);

        if (post) {
          post.shares = (post.shares ?? 0) + 1;
        }
      })

      // BOOKMARK
      .addCase(bookmarkPostThunk.fulfilled, (state, action) => {
        const postId = action.meta.arg.postId;

        const post = state.posts.find((item) => item.id === postId);

        if (post) {
          post.bookmarked = true;

          post.saves = (post.saves ?? 0) + 1;
        }
      })

      // REMOVE BOOKMARK
      .addCase(removeBookmarkThunk.fulfilled, (state, action) => {
        const postId = action.meta.arg.postId;

        const post = state.posts.find((item) => item.id === postId);

        if (post) {
          post.bookmarked = false;

          post.saves = Math.max(0, (post.saves ?? 0) - 1);
        }
      });
  },
});

export const { setSelectedPost, clearSelectedPost, clearPosts } =
  postSlice.actions;

export default postSlice.reducer;
