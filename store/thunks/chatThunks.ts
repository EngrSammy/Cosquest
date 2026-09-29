import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  createDirectChat,
  deleteMessage,
  forwardMessage,
  getChatShare,
  getChats,
  getConversation,
  getMessageSeen,
  getMessageShare,
  getMessages,
  markConversationRead,
  pinMessage,
  reactToMessage,
  removeMessageReaction,
  searchChatUsers,
  sendMessage,
  unpinMessage,
  updateMessage,
} from "@/services/chats";

import type { ChatMedia, ChatMessageFile } from "@/services/chats";

// ==========================================
// FETCH CHATS
// ==========================================

export const fetchChats = createAsyncThunk(
  "chat/fetchChats",
  async (token: string, { rejectWithValue }) => {
    try {
      return await getChats(token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load chats",
      );
    }
  },
);

// ==========================================
// CREATE DIRECT CHAT
// ==========================================
// data.username — NOT userId. The backend's startDirectMessage handler
// resolves the target via resolveDmTarget(req.userId, req.body?.username);
// it looks the person up by username itself and never reads a userId
// field at all. Sending userId here would silently produce
// { username: undefined } on the wire (undefined fields vanish in JSON),
// which is exactly why this failed with "User not found" for every user
// regardless of how valid their id was — the id was simply never used.

export const createChat = createAsyncThunk(
  "chat/createChat",
  async (
    {
      token,
      data,
    }: {
      token: string;
      data: {
        username: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      return await createDirectChat(data.username, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create chat",
      );
    }
  },
);

// ==========================================
// FETCH CONVERSATION
// ==========================================

export const fetchConversation = createAsyncThunk(
  "chat/fetchConversation",
  async (
    {
      conversationId,
      token,
    }: {
      conversationId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await getConversation(conversationId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load conversation",
      );
    }
  },
);

// ==========================================
// FETCH MESSAGES
// ==========================================
// `after`/`limit` are optional and additive — see GetMessagesOptions in
// services/chats. `mode` tells the reducer whether this response is the
// full list (default, "replace" — first load) or just the newest slice
// on top of what's already in state ("append" — poll ticks). The reducer
// dedupes by id either way, so passing `after` before the backend
// supports it is harmless: you'll just get the full list back with
// mode "append", which the reducer merges correctly (no duplicates).
export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (
    {
      conversationId,
      token,
      after,
      limit,
      mode = "replace",
    }: {
      conversationId: string;
      token: string;
      after?: string;
      limit?: number;
      mode?: "replace" | "append";
    },
    { rejectWithValue },
  ) => {
    try {
      const messages = await getMessages(conversationId, token, {
        after,
        limit,
      });

      return {
        conversationId,
        messages,
        mode,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load messages",
      );
    }
  },
);

// ==========================================
// CREATE MESSAGE
// ==========================================

export const createMessage = createAsyncThunk(
  "chat/createMessage",
  async (
    {
      conversationId,
      token,
      data,
    }: {
      conversationId: string;
      token: string;
      data: {
        content?: string;
        replyTo?: string;
        kind?: string;
        media?: ChatMedia | null;
        file?: ChatMessageFile | null;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      const message = await sendMessage(conversationId, data, token);

      // The slice reads message.conversationId, so make sure it is always set.
      return {
        ...message,
        conversationId: message.conversationId || conversationId,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to send message",
      );
    }
  },
);

// ==========================================
// EDIT MESSAGE
// ==========================================

export const editMessage = createAsyncThunk(
  "chat/editMessage",
  async (
    {
      conversationId,
      messageId,
      token,
      data,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
      data: {
        content: string;
      };
    },
    { rejectWithValue },
  ) => {
    try {
      const message = await updateMessage(
        conversationId,
        messageId,
        data,
        token,
      );

      return {
        ...message,
        conversationId: message.conversationId || conversationId,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update message",
      );
    }
  },
);

// ==========================================
// DELETE MESSAGE
// ==========================================

export const removeMessage = createAsyncThunk(
  "chat/removeMessage",
  async (
    {
      conversationId,
      messageId,
      token,
      scope = "me",
    }: {
      conversationId: string;
      messageId: string;
      token: string;
      scope?: "me" | "everyone";
    },
    { rejectWithValue },
  ) => {
    try {
      await deleteMessage(conversationId, messageId, token, scope);

      // The slice needs these three values, so return them explicitly
      // instead of relying on whatever the server sends back.
      return {
        conversationId,
        messageId,
        scope,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to delete message",
      );
    }
  },
);

// ==========================================
// REACT TO MESSAGE
// ==========================================

export const reactToMessageThunk = createAsyncThunk(
  "chat/reactToMessage",
  async (
    {
      conversationId,
      messageId,
      token,
      emoji,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
      emoji: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await reactToMessage(
        conversationId,
        messageId,
        emoji,
        token,
      );

      return {
        conversationId,
        messageId,
        reactions: result.reactions || [],
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to react to message",
      );
    }
  },
);

// ==========================================
// REMOVE REACTION
// ==========================================

export const removeReactionThunk = createAsyncThunk(
  "chat/removeReaction",
  async (
    {
      conversationId,
      messageId,
      token,
      emoji,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
      emoji: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await removeMessageReaction(
        conversationId,
        messageId,
        emoji,
        token,
      );

      return {
        conversationId,
        messageId,
        reactions: result.reactions || [],
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to remove reaction",
      );
    }
  },
);

// ==========================================
// PIN MESSAGE
// ==========================================

export const pinMessageThunk = createAsyncThunk(
  "chat/pinMessage",
  async (
    {
      conversationId,
      messageId,
      token,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      await pinMessage(conversationId, messageId, token);

      return {
        conversationId,
        messageId,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to pin message",
      );
    }
  },
);

// ==========================================
// UNPIN MESSAGE
// ==========================================

export const unpinMessageThunk = createAsyncThunk(
  "chat/unpinMessage",
  async (
    {
      conversationId,
      token,
    }: {
      conversationId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      await unpinMessage(conversationId, token);

      return {
        conversationId,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to unpin message",
      );
    }
  },
);

// ==========================================
// FORWARD MESSAGE
// ==========================================

export const forwardMessageThunk = createAsyncThunk(
  "chat/forwardMessage",
  async (
    {
      conversationId,
      messageId,
      token,
      targetConversationId,
      targetUsername,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
      targetConversationId?: string;
      targetUsername?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      if (
        (!targetConversationId && !targetUsername) ||
        (targetConversationId && targetUsername)
      ) {
        return rejectWithValue("Choose one forwarding destination.");
      }

      const result = await forwardMessage(
        conversationId,
        messageId,
        token,
        targetConversationId,
        targetUsername,
      );

      return {
        sourceConversationId: conversationId,
        targetConversationId,
        targetUsername,
        message: result.message,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to forward message",
      );
    }
  },
);

// ==========================================
// MESSAGE SEEN
// ==========================================

export const fetchMessageSeen = createAsyncThunk(
  "chat/fetchMessageSeen",
  async (
    {
      conversationId,
      messageId,
      token,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await getMessageSeen(conversationId, messageId, token);

      return {
        conversationId,
        messageId,
        seenBy: result.seenBy || result.users || [],
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to load message seen status",
      );
    }
  },
);

// ==========================================
// COPY CHAT SHARE
// ==========================================

export const fetchChatShare = createAsyncThunk(
  "chat/fetchChatShare",
  async (
    {
      conversationId,
      token,
    }: {
      conversationId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await getChatShare(conversationId, token);

      return {
        conversationId,
        link:
          result.shareUrl ||
          result.url ||
          result.link ||
          result.shareLink ||
          null,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create chat link",
      );
    }
  },
);

// ==========================================
// COPY MESSAGE SHARE
// ==========================================

export const fetchMessageShare = createAsyncThunk(
  "chat/fetchMessageShare",
  async (
    {
      conversationId,
      messageId,
      token,
    }: {
      conversationId: string;
      messageId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await getMessageShare(conversationId, messageId, token);

      return {
        conversationId,
        messageId,
        link:
          result.shareUrl ||
          result.url ||
          result.link ||
          result.shareLink ||
          null,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to create message link",
      );
    }
  },
);

// ==========================================
// SEARCH USERS
// ==========================================

export const searchUsers = createAsyncThunk(
  "chat/searchUsers",
  async (
    {
      search,
      token,
    }: {
      search: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const users = await searchChatUsers(search, token);

      // The slice stores users with a required string id.
      return users.map((user) => ({
        ...user,
        id: String(user.id ?? user._id ?? ""),
      }));
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to search users",
      );
    }
  },
);

// ==========================================
// READ CONVERSATION
// ==========================================

export const readConversation = createAsyncThunk(
  "chat/readConversation",
  async (
    {
      conversationId,
      token,
    }: {
      conversationId: string;
      token: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await markConversationRead(conversationId, token);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to mark conversation as read",
      );
    }
  },
);
