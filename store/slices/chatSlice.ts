import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import {
  createChat,
  createMessage,
  editMessage,
  fetchChats,
  fetchChatShare,
  fetchConversation,
  fetchMessages,
  fetchMessageSeen,
  fetchMessageShare,
  pinMessageThunk,
  reactToMessageThunk,
  readConversation,
  removeMessage,
  removeReactionThunk,
  rollbackMessageThunk,
  searchUsers,
  unpinMessageThunk,
} from "../thunks/chatThunks";

import type { Chat, ChatMessage } from "@/services/chats";

type ChatState = {
  conversations: Chat[];

  conversationDetails: Record<string, Chat>;

  messages: Record<string, ChatMessage[]>;

  loading: boolean;

  messagesLoading: Record<string, boolean>;

  error: string | null;

  hiddenMessageIds: Record<string, string[]>;

  pinnedMessageIds: Record<string, string[]>;

  selectedMessageIds: Record<string, string[]>;

  searchedUsers: {
    id: string;
    username?: string;
    name?: string;
    avatarKey?: string;
    avatarPhotoUrl?: string | null;
    faction?: string;
  }[];

  usersLoading: boolean;

  seenByMessage: Record<
    string,
    {
      id?: string;
      username?: string;
      name?: string;
      avatarKey?: string;
      avatarPhotoUrl?: string | null;
      faction?: string;
      lastActiveAt?: string;
      seenAt?: string;
    }[]
  >;

  shareLinks: Record<string, string | null>;

  // Ephemeral, never persisted (matches the backend's own framing of
  // typing:start/stop) — tracked globally, not per-open-screen, so the
  // Direct Message list can show "typing..." for a conversation you
  // haven't even opened yet.
  typingByConversation: Record<string, boolean>;
};

const initialState: ChatState = {
  conversations: [],

  conversationDetails: {},

  messages: {},

  loading: false,

  messagesLoading: {},

  error: null,

  hiddenMessageIds: {},

  pinnedMessageIds: {},

  selectedMessageIds: {},

  searchedUsers: [],

  usersLoading: false,

  seenByMessage: {},

  shareLinks: {},

  typingByConversation: {},
};

// ==========================================
// MESSAGE PREVIEW
// ==========================================

function getPreview(message: ChatMessage): string {
  if (message.deleted) {
    return "This message was deleted.";
  }

  if (message.kind === "audio") {
    return "🎤 Voice message";
  }

  if (message.kind === "image") {
    return "📷 Photo";
  }

  if (message.kind === "video") {
    return "🎥 Video";
  }

  if (message.kind === "document") {
    return "📎 Document";
  }

  // Call entry. A moment later the backend's chat:preview refresh replaces
  // this with the exact wording for this person ("Missed voice call", etc.).
  if (message.kind === "call") {
    return (message as any).callLog?.type === "video"
      ? "🎥 Video call"
      : "📞 Voice call";
  }

  return message.content || "Message";
}

// ==========================================
// UPDATE CHAT PREVIEW
// ==========================================

function updateConversationPreview(state: ChatState, conversationId: string) {
  const messages = state.messages[conversationId] || [];

  if (!messages.length) {
    return;
  }

  const latest = messages[0];

  const lastMessage = {
    senderName: latest.sender?.username,

    preview: getPreview(latest),

    createdAt: latest.createdAt,
  };

  const detail = state.conversationDetails[conversationId];

  if (detail) {
    detail.lastMessage = lastMessage;
  }

  const index = state.conversations.findIndex(
    (chat) => chat.id === conversationId,
  );

  if (index >= 0) {
    state.conversations[index].lastMessage = lastMessage;
  }
}

// ==========================================
// REMOVE USER REACTION
// ==========================================

function removeMyReaction(
  message: ChatMessage,
  userId?: string,
  username?: string,
) {
  if (!message.reactions) {
    return;
  }

  const normalizedUsername = username?.replace(/^@/, "").toLowerCase();

  message.reactions = message.reactions.filter((reaction) => {
    const sameId =
      !!userId &&
      !!reaction.userId &&
      String(reaction.userId) === String(userId);

    const sameUsername =
      !!normalizedUsername &&
      !!reaction.username &&
      reaction.username.replace(/^@/, "").toLowerCase() === normalizedUsername;

    return !sameId && !sameUsername;
  });
}

// ==========================================
// SLICE
// ==========================================

const chatSlice = createSlice({
  name: "chat",

  initialState,

  reducers: {
    // ======================================
    // CLEAR ALL
    // ======================================

    clearChats(state) {
      state.conversations = [];

      state.conversationDetails = {};

      state.messages = {};

      state.messagesLoading = {};

      state.hiddenMessageIds = {};

      state.pinnedMessageIds = {};

      state.selectedMessageIds = {};

      state.searchedUsers = [];

      state.seenByMessage = {};

      state.shareLinks = {};

      state.error = null;
    },

    // ======================================
    // CLEAR ONE CHAT
    // ======================================

    clearConversationMessages(state, action: PayloadAction<string>) {
      delete state.messages[action.payload];
    },

    // ======================================
    // SELECT MESSAGE
    // ======================================

    toggleSelectedMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
      }>,
    ) {
      const { conversationId, messageId } = action.payload;

      if (!state.selectedMessageIds[conversationId]) {
        state.selectedMessageIds[conversationId] = [];
      }

      const list = state.selectedMessageIds[conversationId];

      const index = list.indexOf(messageId);

      if (index >= 0) {
        list.splice(index, 1);
      } else {
        list.push(messageId);
      }
    },

    clearSelectedMessages(state, action: PayloadAction<string>) {
      state.selectedMessageIds[action.payload] = [];
    },

    // ======================================
    // SOCKET — MESSAGE RECEIVED
    // Mirrors createMessage.fulfilled exactly (same dedup-by-id,
    // hiddenMessageIds check, unshift-newest-first, preview update) —
    // this is what fires when a message:new event arrives for someone
    // ELSE's message (your own message already lands via the REST
    // thunk's own .fulfilled case above).
    // ======================================

    socketMessageReceived(
      state,
      action: PayloadAction<{
        conversationId: string;
        message: ChatMessage;
      }>,
    ) {
      const { conversationId, message } = action.payload;

      if (!conversationId || !message) {
        return;
      }

      if (state.hiddenMessageIds[conversationId]?.includes(message.id)) {
        return;
      }

      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }

      const exists = state.messages[conversationId].some(
        (item) => item.id === message.id,
      );

      if (!exists) {
        state.messages[conversationId].unshift({
          ...message,

          conversationId,

          reactions: message.reactions || [],
        });
      }

      updateConversationPreview(state, conversationId);
    },

    // ======================================
    // SOCKET — MESSAGE EDITED
    // Also covers the transcript-finished case: transcribeAndSaveVoiceNote
    // on the backend fires this same event once Deepgram finishes, so a
    // voice note's transcript now arrives here in real time — the
    // "poll again if something is transcribing" workaround in the chat
    // screen is no longer needed once this is wired up.
    // ======================================

    socketMessageEdited(
      state,
      action: PayloadAction<{
        conversationId: string;
        message: ChatMessage;
      }>,
    ) {
      const { conversationId, message } = action.payload;

      const messages = state.messages[conversationId];

      if (!messages || !message) {
        return;
      }

      const index = messages.findIndex((item) => item.id === message.id);

      if (index < 0) {
        return;
      }

      messages[index] = {
        ...messages[index],

        ...message,

        // Live edits never say a message was edited (only its author
        // knows, and their own copy came from the REST response) - keep
        // what this device already knew.
        editedAt: messages[index].editedAt,
        canRollback: messages[index].canRollback,

        conversationId,
      };

      updateConversationPreview(state, conversationId);
    },

    // ======================================
    // SOCKET — MESSAGE DELETED
    // The backend only ever emits this for scope:"everyone" — a
    // "delete for me" never emits at all (no one else is affected), so
    // there's no scope branch to handle here, unlike removeMessage's
    // REST-driven reducer above which covers both.
    // ======================================

    socketMessageDeleted(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        byAdmin?: boolean;
      }>,
    ) {
      const { conversationId, messageId, byAdmin } = action.payload;

      const messages = state.messages[conversationId];

      if (!messages) {
        return;
      }

      const index = messages.findIndex((message) => message.id === messageId);

      if (index >= 0) {
        messages[index] = {
          ...messages[index],

          deleted: true,

          deletedByAdmin: !!byAdmin,

          content: byAdmin
            ? "This message was deleted by an admin."
            : "This message was deleted.",

          media: null,

          reactions: [],
        };
      }

      updateConversationPreview(state, conversationId);
    },

    // ======================================
    // SOCKET — REACTION ADDED/REMOVED
    // The backend deliberately broadcasts raw per-user facts
    // ({emoji, userId}), not a pre-computed "mine" flag — computing
    // "mine" server-side once and broadcasting it to everyone would mean
    // every OTHER viewer sees somebody else's reaction mislabeled as
    // their own. findMyReaction/getReactionCounts in the chat screen
    // already handle exactly this raw shape correctly, so this just
    // stores it as-is.
    // ======================================

    socketMessageReaction(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        reactions: ChatMessage["reactions"];
      }>,
    ) {
      const { conversationId, messageId, reactions } = action.payload;

      const messages = state.messages[conversationId];

      if (!messages) {
        return;
      }

      const message = messages.find((item) => item.id === messageId);

      if (!message) {
        return;
      }

      message.reactions = reactions || [];
    },

    // ======================================
    // SOCKET — PINNED/UNPINNED
    // pinnedMessage is null on unpin, {id} on pin — covers both
    // pinMessageThunk.fulfilled and unpinMessageThunk.fulfilled's
    // combined behavior in one reducer, since the backend emits one
    // event (chat:pinned) for both cases.
    // ======================================

    socketChatPinned(
      state,
      action: PayloadAction<{
        conversationId: string;
        pinnedMessage: {
          id: string;
        } | null;
      }>,
    ) {
      const { conversationId, pinnedMessage } = action.payload;

      state.pinnedMessageIds[conversationId] = pinnedMessage
        ? [pinnedMessage.id]
        : [];

      const detail = state.conversationDetails[conversationId];

      if (detail) {
        detail.pinnedMessage = pinnedMessage;
      }
    },

    // ======================================
    // SOCKET — CHAT READ
    // The backend fires chat:read for ANY read action in the
    // conversation, including your own — currentUserId is passed
    // alongside the payload so this only ever updates the OTHER
    // participant's lastReadAt, never overwriting it with your own
    // read receipt. Written to both conversationDetails and the
    // conversations list, same as every other reducer here that keeps
    // those two in sync.
    // ======================================

    socketChatRead(
      state,
      action: PayloadAction<{
        conversationId: string;
        userId: string;
        lastReadAt: string;
        currentUserId: string;
      }>,
    ) {
      const { conversationId, userId, lastReadAt, currentUserId } =
        action.payload;

      if (String(userId) === String(currentUserId)) {
        return;
      }

      const detail = state.conversationDetails[conversationId];

      if (detail?.otherParticipant) {
        detail.otherParticipant.lastReadAt = lastReadAt;
      }

      const index = state.conversations.findIndex(
        (chat) => chat.id === conversationId,
      );

      if (index >= 0 && state.conversations[index].otherParticipant) {
        state.conversations[index].otherParticipant!.lastReadAt = lastReadAt;
      }
    },

    // ======================================
    // SOCKET — PRESENCE CHANGED
    // presence:online / presence:offline only ever reach this account's
    // DM partners (see notifyPresenceChange's dmPartnerIds — community/
    // faction rooms have no stored member list to broadcast to). Applied
    // to every conversation where this userId is the otherParticipant,
    // which in practice is at most one DM thread.
    //
    // lastActiveAt comes with presence:offline (presence.js saves the
    // moment they left) so "last seen today at 14:32" shows the real
    // time without refetching anything.
    // ======================================

    socketPresenceChanged(
      state,
      action: PayloadAction<{
        userId: string;
        online: boolean;
        lastActiveAt?: string;
      }>,
    ) {
      const { userId, online, lastActiveAt } = action.payload;

      const apply = (participant?: Chat["otherParticipant"]) => {
        if (participant?.id && String(participant.id) === String(userId)) {
          participant.isOnline = online;

          if (lastActiveAt) {
            participant.lastActiveAt = lastActiveAt;
          }
        }
      };

      Object.values(state.conversationDetails).forEach((detail) => {
        apply(detail.otherParticipant);
      });

      state.conversations.forEach((chat) => {
        apply(chat.otherParticipant);
      });
    },

    // ======================================
    // SOCKET — TYPING
    // Global, not scoped to whichever chat screen happens to be open —
    // the Direct Message list needs to show "typing..." for a
    // conversation you haven't opened, not just the currently open one.
    // ======================================

    socketTypingStarted(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      state.typingByConversation[action.payload.conversationId] = true;
    },

    socketTypingStopped(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      state.typingByConversation[action.payload.conversationId] = false;
    },
  },

  extraReducers: (builder) => {
    builder

      // ======================================
      // FETCH CHATS
      // ======================================

      .addCase(fetchChats.pending, (state) => {
        state.loading = true;

        state.error = null;
      })

      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;

        state.conversations = action.payload || [];

        for (const chat of action.payload || []) {
          state.conversationDetails[chat.id] = chat;
        }
      })

      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load chats";
      })

      // ======================================
      // CREATE CHAT
      // ======================================

      .addCase(createChat.fulfilled, (state, action) => {
        const chat = action.payload;

        if (!chat) {
          return;
        }

        state.conversationDetails[chat.id] = chat;

        const exists = state.conversations.some((item) => item.id === chat.id);

        if (!exists) {
          state.conversations.unshift(chat);
        }
      })

      // ======================================
      // FETCH CONVERSATION
      // ======================================

      .addCase(fetchConversation.fulfilled, (state, action) => {
        const chat = action.payload;

        if (!chat) {
          return;
        }

        state.conversationDetails[chat.id] = {
          ...state.conversationDetails[chat.id],
          ...chat,
        };

        const index = state.conversations.findIndex(
          (item) => item.id === chat.id,
        );

        if (index >= 0) {
          state.conversations[index] = {
            ...state.conversations[index],
            ...chat,
          };
        } else {
          state.conversations.push(chat);
        }

        const pinnedId = chat.pinnedMessage?.id;

        if (pinnedId) {
          state.pinnedMessageIds[chat.id] = [pinnedId];
        } else {
          state.pinnedMessageIds[chat.id] = [];
        }
      })

      // ======================================
      // FETCH MESSAGES
      // ======================================

      .addCase(fetchMessages.pending, (state, action) => {
        const conversationId = action.meta.arg.conversationId;

        state.messagesLoading[conversationId] = true;
      })

      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, messages, mode } = action.payload;

        state.messagesLoading[conversationId] = false;

        const hiddenIds = state.hiddenMessageIds[conversationId] || [];

        const incoming = (messages || [])
          .filter((message) => !hiddenIds.includes(message.id))
          .map((message) => ({
            ...message,
            conversationId,
            reactions: message.reactions || [],
          }));

        if (mode === "append") {
          // Incremental poll fetch: merge instead of replace, so we don't
          // need the backend to return the full history every tick. Dedup
          // by id so this stays correct even if the backend doesn't
          // support `after` yet and just returns everything again —
          // nothing gets duplicated either way.
          const existing = state.messages[conversationId] || [];

          const existingIds = new Set(existing.map((item) => item.id));

          const newOnes = incoming.filter(
            (message) => !existingIds.has(message.id),
          );

          if (newOnes.length > 0) {
            // Messages are newest-first (matches the unshift() below in
            // CREATE MESSAGE), so new ones go at the front.
            state.messages[conversationId] = [...newOnes, ...existing];
          }

          // Existing messages may have changed (edited/deleted/reacted to)
          // even if nothing new arrived — keep those in sync too.
          if (existing.length > 0) {
            const incomingById = new Map(
              incoming.map((message) => [message.id, message]),
            );

            state.messages[conversationId] = (
              state.messages[conversationId] || existing
            ).map((message) => incomingById.get(message.id) || message);
          }
        } else {
          state.messages[conversationId] = incoming;
        }

        updateConversationPreview(state, conversationId);
      })

      .addCase(fetchMessages.rejected, (state, action) => {
        const conversationId = action.meta.arg.conversationId;

        state.messagesLoading[conversationId] = false;

        state.error =
          typeof action.payload === "string"
            ? action.payload
            : "Failed to load messages";
      })

      // ======================================
      // CREATE MESSAGE
      // ======================================

      .addCase(createMessage.fulfilled, (state, action) => {
        const message = action.payload;

        if (!message) {
          return;
        }

        const conversationId = message.conversationId;

        if (!conversationId) {
          return;
        }

        if (state.hiddenMessageIds[conversationId]?.includes(message.id)) {
          return;
        }

        if (!state.messages[conversationId]) {
          state.messages[conversationId] = [];
        }

        const exists = state.messages[conversationId].some(
          (item) => item.id === message.id,
        );

        if (!exists) {
          state.messages[conversationId].unshift({
            ...message,

            conversationId,

            reactions: message.reactions || [],
          });
        }

        updateConversationPreview(state, conversationId);
      })

      // ======================================
      // EDIT MESSAGE
      // ======================================

      .addCase(editMessage.fulfilled, (state, action) => {
        const message = action.payload;

        if (!message) {
          return;
        }

        const conversationId =
          message.conversationId || action.meta.arg.conversationId;

        const messages = state.messages[conversationId];

        if (!messages) {
          return;
        }

        const index = messages.findIndex((item) => item.id === message.id);

        if (index < 0) {
          return;
        }

        messages[index] = {
          ...messages[index],

          ...message,

          conversationId,
        };

        updateConversationPreview(state, conversationId);
      })

      // ======================================
      // UNDO EDIT (same as an edit)
      // ======================================

      .addCase(rollbackMessageThunk.fulfilled, (state, action) => {
        const message = action.payload;

        if (!message) {
          return;
        }

        const conversationId =
          message.conversationId || action.meta.arg.conversationId;

        const messages = state.messages[conversationId];

        if (!messages) {
          return;
        }

        const index = messages.findIndex((item) => item.id === message.id);

        if (index < 0) {
          return;
        }

        messages[index] = {
          ...messages[index],
          ...message,
          conversationId,
        };

        updateConversationPreview(state, conversationId);
      })

      // ======================================
      // DELETE MESSAGE
      // ======================================

      .addCase(removeMessage.fulfilled, (state, action) => {
        const { conversationId, messageId, scope } = action.payload;

        const messages = state.messages[conversationId] || [];

        if (scope === "me") {
          if (!state.hiddenMessageIds[conversationId]) {
            state.hiddenMessageIds[conversationId] = [];
          }

          const hidden = state.hiddenMessageIds[conversationId];

          if (!hidden.includes(messageId)) {
            hidden.push(messageId);
          }

          state.messages[conversationId] = messages.filter(
            (message) => message.id !== messageId,
          );
        }

        if (scope === "everyone") {
          const index = messages.findIndex(
            (message) => message.id === messageId,
          );

          if (index >= 0) {
            messages[index] = {
              ...messages[index],

              deleted: true,

              content: "This message was deleted.",

              media: null,

              reactions: [],
            };
          }
        }

        updateConversationPreview(state, conversationId);
      })

      // ======================================
      // REACTION
      // ======================================

      .addCase(reactToMessageThunk.fulfilled, (state, action) => {
        const { conversationId, messageId, reactions } = action.payload;

        const messages = state.messages[conversationId];

        if (!messages) {
          return;
        }

        const message = messages.find((item) => item.id === messageId);

        if (!message) {
          return;
        }

        message.reactions = reactions || [];
      })

      .addCase(removeReactionThunk.fulfilled, (state, action) => {
        const { conversationId, messageId, reactions } = action.payload;

        const messages = state.messages[conversationId];

        if (!messages) {
          return;
        }

        const message = messages.find((item) => item.id === messageId);

        if (!message) {
          return;
        }

        message.reactions = reactions || [];
      })

      // ======================================
      // PIN
      // ======================================

      .addCase(pinMessageThunk.fulfilled, (state, action) => {
        const { conversationId, messageId } = action.payload;

        state.pinnedMessageIds[conversationId] = [messageId];

        const detail = state.conversationDetails[conversationId];

        if (detail) {
          detail.pinnedMessage = {
            id: messageId,
          };
        }
      })

      // ======================================
      // UNPIN
      // ======================================

      .addCase(unpinMessageThunk.fulfilled, (state, action) => {
        const conversationId = action.payload.conversationId;

        state.pinnedMessageIds[conversationId] = [];

        const detail = state.conversationDetails[conversationId];

        if (detail) {
          detail.pinnedMessage = null;
        }
      })

      // ======================================
      // SEARCH USERS
      // ======================================

      .addCase(searchUsers.pending, (state) => {
        state.usersLoading = true;
      })

      .addCase(searchUsers.fulfilled, (state, action) => {
        state.usersLoading = false;

        state.searchedUsers = action.payload || [];
      })

      .addCase(searchUsers.rejected, (state) => {
        state.usersLoading = false;

        state.searchedUsers = [];
      })

      // ======================================
      // SEEN
      // ======================================

      .addCase(fetchMessageSeen.fulfilled, (state, action) => {
        const key = `${action.payload.conversationId}:${action.payload.messageId}`;

        state.seenByMessage[key] = action.payload.seenBy || [];
      })

      // ======================================
      // MESSAGE SHARE
      // ======================================

      .addCase(fetchMessageShare.fulfilled, (state, action) => {
        const key = `${action.payload.conversationId}:${action.payload.messageId}`;

        state.shareLinks[key] = action.payload.link;
      })

      // ======================================
      // CHAT SHARE
      // ======================================

      .addCase(fetchChatShare.fulfilled, (state, action) => {
        const key = `chat:${action.payload.conversationId}`;

        state.shareLinks[key] = action.payload.link;
      })

      // ======================================
      // READ
      // ======================================

      .addCase(readConversation.fulfilled, (state, action) => {
        const conversationId = action.meta.arg.conversationId;

        const detail = state.conversationDetails[conversationId];

        if (detail) {
          detail.unreadCount = 0;
        }

        const index = state.conversations.findIndex(
          (chat) => chat.id === conversationId,
        );

        if (index >= 0) {
          state.conversations[index].unreadCount = 0;
        }
      });
  },
});

export const {
  clearChats,
  clearConversationMessages,
  toggleSelectedMessage,
  clearSelectedMessages,
  socketMessageReceived,
  socketMessageEdited,
  socketMessageDeleted,
  socketMessageReaction,
  socketChatPinned,
  socketChatRead,
  socketPresenceChanged,
  socketTypingStarted,
  socketTypingStopped,
} = chatSlice.actions;

export default chatSlice.reducer;
