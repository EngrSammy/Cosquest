import {
  createDirectChat,
  deleteMessage,
  getChats,
  getConversation,
  getMessages,
  markConversationRead,
  sendMessage,
  updateMessage,
} from "@/services/chats";
import { createAsyncThunk } from "@reduxjs/toolkit";

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

export const createChat = createAsyncThunk(
  "chat/createChat",
  async (
    { token, data }: { token: string; data: unknown },
    { rejectWithValue },
  ) => {
    try {
      return await createDirectChat(token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to create chat",
      );
    }
  },
);

export const fetchConversation = createAsyncThunk(
  "chat/fetchConversation",
  async (
    { conversationId, token }: { conversationId: string; token: string },
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

export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (
    { conversationId, token }: { conversationId: string; token: string },
    { rejectWithValue },
  ) => {
    try {
      const messages = await getMessages(conversationId, token);

      return {
        conversationId,
        messages,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to load messages",
      );
    }
  },
);

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
      data: unknown;
    },
    { rejectWithValue },
  ) => {
    try {
      return await sendMessage(conversationId, token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to send message",
      );
    }
  },
);

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
      data: unknown;
    },
    { rejectWithValue },
  ) => {
    try {
      return await updateMessage(conversationId, messageId, token, data);
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update message",
      );
    }
  },
);

export const removeMessage = createAsyncThunk(
  "chat/removeMessage",
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
      await deleteMessage(conversationId, messageId, token);

      return {
        conversationId,
        messageId,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to delete message",
      );
    }
  },
);

export const readConversation = createAsyncThunk(
  "chat/readConversation",
  async (
    { conversationId, token }: { conversationId: string; token: string },
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
