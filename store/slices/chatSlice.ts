import { createSlice } from "@reduxjs/toolkit";
import {
  createMessage,
  fetchChats,
  fetchMessages,
  removeMessage,
} from "../thunks/chatThunks";

type Message = {
  id: string;
  conversationId: string;
  senderId?: string;
  content?: string;
  createdAt?: string;
};

type Conversation = {
  id: string;
  participants?: string[];
  lastMessage?: Message;
};

type ChatState = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  loading: boolean;
  error: string | null;
};

const initialState: ChatState = {
  conversations: [],
  messages: {},
  loading: false,
  error: null,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,

  reducers: {
    clearChats(state) {
      state.conversations = [];
      state.messages = {};
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        state.conversations = action.payload as Conversation[];
      })

      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load chats";
      })

      .addCase(fetchMessages.fulfilled, (state, action) => {
        const payload = action.payload as {
          conversationId: string;
          messages: Message[];
        };

        state.messages[payload.conversationId] = payload.messages;
      })

      .addCase(createMessage.fulfilled, (state, action) => {
        if (!action.payload) return;

        const message = action.payload as Message;
        const conversationId = message.conversationId;

        if (!state.messages[conversationId]) {
          state.messages[conversationId] = [];
        }

        state.messages[conversationId].push(message);
      })

      .addCase(removeMessage.fulfilled, (state, action) => {
        const payload = action.payload as {
          conversationId: string;
          messageId: string;
        };

        state.messages[payload.conversationId] = (
          state.messages[payload.conversationId] || []
        ).filter((message) => message.id !== payload.messageId);
      });
  },
});

export const { clearChats } = chatSlice.actions;

export default chatSlice.reducer;
