import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  ImageStyle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  createMessage,
  editMessage,
  fetchConversation,
  fetchMessageSeen,
  fetchMessageShare,
  fetchMessages,
  forwardMessageThunk,
  pinMessageThunk,
  reactToMessageThunk,
  readConversation,
  removeMessage,
  removeReactionThunk,
  searchUsers,
  unpinMessageThunk,
} from "@/store/thunks/chatThunks";

import {
  clearSelectedMessages,
  socketChatPinned,
  socketChatRead,
  socketMessageDeleted,
  socketMessageEdited,
  socketMessageReaction,
  socketMessageReceived,
  toggleSelectedMessage,
} from "@/store/slices/chatSlice";

import {
  getSocket,
  joinConversation,
  leaveConversation,
  startTyping,
  stopTyping,
} from "@/services/socket";

import { ChatWallpaperBackground } from "@/components/chat/ChatWallpaperBackground";
import { LinkText } from "@/components/chat/LinkText";
import { useChatWallpaper } from "@/components/chat/useChatWallpaper";
import VideoFirstFrame from "@/components/chat/VideoFirstFrame";
import {
  SpeedPill,
  applySpeed,
  getRememberedSpeed,
  nextSpeed,
} from "@/components/chat/VoiceSpeed";
import { WallpaperPicker } from "@/components/chat/WallpaperPicker";
import type { Wallpaper } from "@/constants/wallpapers";
import {
  blockUser,
  getBlockedUsernames,
  unblockUser,
} from "@/services/publicProfile";
import { startCall } from "@/store/thunks/callThunks";
import { ensureCallPermissions } from "@/utils/callHelpers";

type AttachmentDraft = {
  uri: string;
  name: string;
  type: string;
  kind: "image" | "video" | "document";
};

type Reaction = {
  emoji: string;
  userId?: string;
  username?: string;
  count?: number;
  mine?: boolean;
};

type Message = {
  id: string;

  conversationId?: string;

  kind?: string;

  content?: string;

  sender?: {
    id?: string;
    _id?: string;
    username?: string;

    profilePicture?: string | null;
    avatar?: string | null;
    avatarUrl?: string | null;
    avatarPhotoUrl?: string | null;

    isOnline?: boolean;
  };

  deleted?: boolean;

  editedAt?: string | null;

  createdAt?: string;

  forwarded?: boolean;

  media?: {
    url?: string;
    uri?: string;
    name?: string;
    filename?: string;
    type?: string;
    mimeType?: string;
    size?: number;
    duration?: number;
    durationSeconds?: number;
    // Set by the backend once speech-to-text finishes for a voice note.
    // transcribing:true means the backend has the audio and is actively
    // processing it — shown as "Transcribing…" until transcript arrives
    // (on a later poll/refetch, since transcription won't finish within
    // the same request that uploads the audio).
    transcript?: string | null;
    transcribing?: boolean;
    // Per-word timestamps (seconds) for karaoke-style sync highlighting
    // during playback. May be absent on older messages transcribed
    // before this field existed — falls back to plain (unsynced) text.
    transcriptWords?: { word: string; start: number; end: number }[] | null;
  } | null;

  reactions?: Reaction[];

  replyTo?: Message | null;
  pending?: boolean;

  // Set by the backend on YOUR messages in a DM: true once the other
  // person has opened the chat since it was sent (serializeMessage's
  // `read` field in chatController.js).
  read?: boolean;

  // Call entries (kind "call"): saved by the backend when a call finishes.
  // The sender is always the CALLER.
  callLog?: {
    callId?: string;
    type?: "audio" | "video";
    status?: "ended" | "declined" | "missed" | "cancelled";
    durationSeconds?: number | null;
    callerId?: string;
  } | null;
};

type Chat = {
  id: string;

  type?: "community" | "faction" | "dm";

  title?: string;

  memberCount?: number;

  unreadCount?: number;

  messageCount?: number;

  otherParticipant?: {
    id?: string;
    _id?: string;
    username?: string;

    profilePicture?: string | null;
    avatar?: string | null;
    avatarUrl?: string | null;
    avatarPhotoUrl?: string | null;

    isOnline?: boolean;

    lastActiveAt?: string;

    lastReadAt?: string | null;
  };

  pinnedMessage?: {
    id?: string;
  } | null;
};

type SeenPerson = {
  id?: string;
  username?: string;
  name?: string;
  avatarPhotoUrl?: string | null;
  seenAt?: string;
};

const EMPTY_MESSAGES: Message[] = [];

// Long-press menu: ignore taps for a moment after it opens, so lifting the
// finger that opened it can't press an option underneath by accident.
const MENU_TAP_GUARD_MS = 450;

// The backend only allows "Delete for everyone" this soon after sending.
const DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;
const EMPTY_MESSAGE_IDS: string[] = [];

const REACTION_EMOJIS = ["❤️", "😂", "😍", "😮", "😢", "😡", "👍", "👎"];

const SWIPE_REPLY_THRESHOLD = 60;
const VOICE_CANCEL_THRESHOLD = -80;
const MIN_VOICE_MILLIS = 800;

// This used to be the primary way new messages/edits arrived (every 5s).
// Now that sockets deliver message:new/message:edited/etc. live, this is
// just a safety net in case an event is missed (e.g. a brief
// disconnect) — so it can run far less often.
const SAFETY_POLL_INTERVAL_MS = 30000;

// Photo/video compression: full quality (1.0) produces multi-MB files that
// dominate "why is sending slow" — most of the wait is the upload itself.
const IMAGE_PICKER_QUALITY = 0.6;

// Generates local-only ids/filenames (pending message ids, recorded voice
// note filenames). Deliberately a plain module-level function rather than
// something defined inside the component: ESLint's react-hooks/purity
// rule (part of the React Compiler ruleset) flags Date.now()/Math.random()
// wherever they appear lexically inside a component's body, even when —
// as here — they're only ever invoked from event handlers (send,
// finishVoiceRecording, etc.), never during render itself. Living outside
// the component sidesteps that false positive entirely.
function generateLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function generateVoiceFileName() {
  return `voice-message-${Date.now()}.m4a`;
}

// ==========================================
// PENDING → REAL MESSAGE MATCHING
// ==========================================
// When you send, a temporary "pending" bubble (clock icon) shows right
// away. The real message then arrives TWICE: once through the socket
// (message:new) and once as the REST reply — and the socket copy often
// arrives first. Without this, the pending bubble and the real one were
// both on screen for a moment, then the pending one vanished: the
// "message drops twice, then one deletes" effect.
//
// This recognises "that real message IS my pending one" (same sender,
// same kind, same text, sent within a couple of minutes), so the pending
// copy is hidden the instant the real one exists — only one bubble ever
// shows.
const PENDING_MATCH_WINDOW_MS = 2 * 60 * 1000;

function isRealCopyOfPending(
  real: Message,
  pending: Message,
  currentUserId: string,
) {
  if (real.pending) {
    return false;
  }

  const realSenderId = String(real.sender?.id || real.sender?._id || "");

  if (!currentUserId || realSenderId !== String(currentUserId)) {
    return false;
  }

  if ((real.kind || "text") !== (pending.kind || "text")) {
    return false;
  }

  if ((real.content || "").trim() !== (pending.content || "").trim()) {
    return false;
  }

  const realTime = new Date(real.createdAt || 0).getTime();
  const pendingTime = new Date(pending.createdAt || 0).getTime();

  return Math.abs(realTime - pendingTime) < PENDING_MATCH_WINDOW_MS;
}

// ==========================================
// TIME
// ==========================================

function formatMessageTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ==========================================
// DATE KEY
// ==========================================

function getDateKey(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// ==========================================
// DATE LABEL
// ==========================================

function getDateLabel(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();

  const todayKey = getDateKey(today.toISOString());

  const yesterday = new Date(today);

  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayKey = getDateKey(yesterday.toISOString());

  const messageKey = getDateKey(value);

  if (messageKey === todayKey) {
    return "TODAY";
  }

  if (messageKey === yesterdayKey) {
    return "YESTERDAY";
  }

  return date
    .toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

// ==========================================
// LAST SEEN
// ==========================================

function formatLastSeen(value?: string) {
  if (!value) {
    return "last seen recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "last seen recently";
  }

  const label = getDateLabel(value);

  const time = formatMessageTime(value);

  if (label === "TODAY") {
    return `last seen today at ${time}`;
  }

  if (label === "YESTERDAY") {
    return `last seen yesterday at ${time}`;
  }

  return `last seen ${date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

// ==========================================
// FILE HELPERS
// ==========================================

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} kB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileExtension(name?: string) {
  if (!name || !name.includes(".")) {
    return "";
  }

  return (name.split(".").pop() || "").toUpperCase();
}

function formatDuration(totalSeconds?: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));

  const minutes = Math.floor(seconds / 60);

  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

// ==========================================
// AVATAR
// ==========================================

function getAvatar(person?: {
  profilePicture?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  avatarPhotoUrl?: string | null;
}) {
  return (
    person?.profilePicture ||
    person?.avatarPhotoUrl ||
    person?.avatarUrl ||
    person?.avatar ||
    null
  );
}

// ==========================================
// MEDIA URL
// ==========================================

function getMediaUrl(media?: Message["media"]) {
  if (!media) {
    return null;
  }

  return media.url || media.uri || null;
}

// ==========================================
// REACTION COUNT
// ==========================================

function getReactionCounts(reactions: Reaction[]) {
  const map = new Map<string, number>();

  for (const reaction of reactions) {
    const current = map.get(reaction.emoji) || 0;

    const reactionCount =
      typeof reaction.count === "number" ? reaction.count : 1;

    map.set(reaction.emoji, current + reactionCount);
  }

  return Array.from(map.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

// ==========================================
// MESSAGE TYPE
// ==========================================

function getMessageTypeLabel(message: Message) {
  switch (message.kind) {
    case "image":
      return "Photo";

    case "video":
      return "Video";

    case "audio":
      return "Voice message";

    case "document":
      return message.media?.name || message.media?.filename || "Document";

    case "call":
      return message.callLog?.type === "video" ? "Video call" : "Voice call";

    default:
      return null;
  }
}

function getMessageTypeIcon(
  message: Message,
): keyof typeof Ionicons.glyphMap | null {
  switch (message.kind) {
    case "image":
      return "image";

    case "video":
      return "videocam";

    case "audio":
      return "mic";

    case "document":
      return "document-text";

    default:
      return null;
  }
}

// ==========================================
// DATE SEPARATOR
// ==========================================

function DateSeparator({ message }: { message: Message }) {
  return (
    <View style={styles.dateSeparatorContainer}>
      <View style={styles.dateSeparator}>
        <Text style={styles.dateSeparatorText}>
          {getDateLabel(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ==========================================
// SWIPE TO REPLY
// ==========================================

function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const enabledRef = useRef(enabled);
  const onReplyRef = useRef(onReply);

  enabledRef.current = enabled;
  onReplyRef.current = onReply;

  const springBack = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        enabledRef.current &&
        gesture.dx > 12 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,

      onPanResponderTerminationRequest: () => false,

      onPanResponderMove: (_, gesture) => {
        translateX.setValue(Math.max(0, Math.min(gesture.dx, 72)));
      },

      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx >= SWIPE_REPLY_THRESHOLD) {
          onReplyRef.current();
        }

        springBack();
      },

      onPanResponderTerminate: springBack,
    }),
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, 24, 56],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const iconScale = translateX.interpolate({
    inputRange: [0, 56],
    outputRange: [0.5, 1],
    extrapolate: "clamp",
  });

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeIconWrap,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}>
        <View style={styles.swipeIcon}>
          <Ionicons name="arrow-undo" size={17} color="#C5399A" />
        </View>
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// ==========================================
// MESSAGE META (time + ticks)
// ==========================================

// ==========================================
// TICK STATE (read receipts)
// ==========================================
// DM-only by nature: otherParticipant only ever exists on a "dm" typed
// Chat, so a group/community/faction message's otherParticipant is
// always undefined here and this naturally falls back to "sent" (single
// check) — there's no single meaningful "read by everyone" timestamp
// for a group the way there is for one specific DM partner.

// pending   → clock (still sending)
// sent      → one grey tick (they're offline, not delivered yet)
// delivered → two grey ticks (they're online / it reached them)
// read      → two PINK ticks (they opened the chat after it was sent)
type TickState = "pending" | "sent" | "delivered" | "read";

// Colour of the "read" ticks. It CAN'T be the brand pink: your own bubbles
// are pink (#C5399A), so pink ticks on them were invisible — which looked
// like the ticks "disappearing" the moment the other person read the
// message. Teal (the same teal as the call screen) stands out clearly on
// the pink bubble, like WhatsApp's blue ticks on its green bubble.
// Change this one value to try another colour.
const READ_TICK_COLOR = "#3FD3E0";

function getTickState(
  msg: Message,
  otherParticipant?: Chat["otherParticipant"],
): TickState {
  if (msg.pending) {
    return "pending";
  }

  // The backend already knows — trust it (right on first load).
  if (msg.read === true) {
    return "read";
  }

  // Live updates: chat:read socket event moves lastReadAt forward.
  if (otherParticipant?.lastReadAt && msg.createdAt) {
    const readTime = new Date(otherParticipant.lastReadAt).getTime();
    const msgTime = new Date(msg.createdAt).getTime();

    if (
      !Number.isNaN(readTime) &&
      !Number.isNaN(msgTime) &&
      readTime >= msgTime
    ) {
      return "read";
    }
  }

  return otherParticipant?.isOnline ? "delivered" : "sent";
}

function MessageMeta({
  msg,
  mine,
  pinned,
  variant,
  otherParticipant,
}: {
  msg: Message;
  mine: boolean;
  pinned: boolean;
  variant: "inline" | "overlay" | "flow";
  otherParticipant?: Chat["otherParticipant"];
}) {
  const color =
    variant === "overlay"
      ? "#FFFFFF"
      : mine
        ? "rgba(255,255,255,0.78)"
        : "#9C9CAA";

  // No ticks on call entries (like WhatsApp).
  const tickState =
    mine && msg.kind !== "call" ? getTickState(msg, otherParticipant) : null;

  // Read gets its own fixed colour so it's clearly different from the
  // grey/white "sent"/"delivered" ticks — see READ_TICK_COLOR above.
  const tickColor = tickState === "read" ? READ_TICK_COLOR : color;

  return (
    <View
      style={[
        styles.messageMeta,
        variant === "inline" && styles.metaInline,
        variant === "overlay" && styles.metaOverlay,
        variant === "flow" && styles.metaFlow,
      ]}>
      {pinned ? <Ionicons name="pin" size={11} color={color} /> : null}

      {msg.editedAt && !msg.deleted ? (
        <Text style={[styles.editedText, { color }]}>edited</Text>
      ) : null}

      <Text style={[styles.bubbleTime, { color }]}>
        {formatMessageTime(msg.createdAt)}
      </Text>

      {tickState ? (
        <Ionicons
          name={
            tickState === "pending"
              ? "time-outline"
              : tickState === "sent"
                ? "checkmark"
                : "checkmark-done"
          }
          size={14}
          color={tickColor}
        />
      ) : null}
    </View>
  );
}

// ==========================================
// BUBBLE
// ==========================================
// Wrapped in memo(): this is the most expensive item in the list and was
// re-rendering on every poll tick (see MESSAGE_POLL_INTERVAL_MS) even when
// its own props hadn't changed, because the FlatList's extraData object
// was being recreated every render. Combined with the extraData fix below,
// this keeps re-renders to only the bubbles that actually changed.
const Bubble = memo(function Bubble({
  msg,
  mine,
  groupChat,
  firstInGroup,
  lastInGroup,
  selected,
  pinned,
  myReactionEmoji,
  onPress,
  onLongPress,
  onReaction,
  onMediaPress,
  onReplyPress,
  onCallBack,
  otherParticipant,
}: {
  msg: Message;

  mine: boolean;

  groupChat: boolean;

  firstInGroup: boolean;

  lastInGroup: boolean;

  selected: boolean;

  pinned: boolean;

  myReactionEmoji?: string;

  onPress: (message: Message) => void;

  onLongPress: (message: Message) => void;

  onReaction: (message: Message, emoji: string) => void;

  onMediaPress: (message: Message) => void;

  onReplyPress: (messageId: string) => void;

  onCallBack: (type: "audio" | "video") => void;

  otherParticipant?: Chat["otherParticipant"];
}) {
  const senderName = msg.sender?.username || "User";

  const avatar = getAvatar(msg.sender);

  const text = msg.deleted ? "🚫 This message was deleted." : msg.content || "";

  const mediaUrl = getMediaUrl(msg.media);

  const hasMedia =
    !!msg.kind &&
    ["image", "video", "audio", "document"].includes(msg.kind) &&
    !msg.deleted;

  const isVisual =
    !msg.deleted &&
    (msg.kind === "image" || msg.kind === "video") &&
    !!mediaUrl;

  const metaVariant: "inline" | "overlay" | "flow" = text
    ? "inline"
    : isVisual
      ? "overlay"
      : "flow";

  // Invisible spacer so the last line of text never runs under the time.
  const spacer = "\u00A0".repeat(
    12 + (mine ? 5 : 0) + (msg.editedAt && !msg.deleted ? 7 : 0),
  );

  const replyIcon = msg.replyTo ? getMessageTypeIcon(msg.replyTo) : null;

  const hasReactions = !!msg.reactions && msg.reactions.length > 0;

  return (
    <View
      style={[
        styles.bubbleRow,
        mine ? styles.rowMine : styles.rowTheirs,
        firstInGroup ? styles.rowGroupStart : styles.rowGroupContinue,
        hasReactions && styles.rowWithReactions,
        selected && styles.selectedRow,
      ]}>
      {!mine && groupChat ? (
        <View style={styles.avatarSlot}>
          {lastInGroup ? (
            <View style={styles.messageAvatar}>
              {avatar ? (
                <ExpoImage
                  source={{
                    uri: avatar,
                  }}
                  style={styles.messageAvatarImage}
                  cachePolicy="memory-disk"
                />
              ) : (
                <Ionicons name="person" size={15} color="#C5399A" />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.bubbleColumn,
          mine ? styles.columnMine : styles.columnTheirs,
        ]}>
        <Pressable
          onPress={() => onPress(msg)}
          onLongPress={() => onLongPress(msg)}
          delayLongPress={300}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            firstInGroup && (mine ? styles.tailMine : styles.tailTheirs),
            hasMedia && styles.mediaBubble,
          ]}>
          {!mine && groupChat && firstInGroup ? (
            <Text style={[styles.senderName, hasMedia && styles.mediaPad]}>
              {senderName}
            </Text>
          ) : null}

          {msg.forwarded && !msg.deleted ? (
            <View
              style={[styles.forwardedIndicator, hasMedia && styles.mediaPad]}>
              <Ionicons
                name="arrow-redo-outline"
                size={12}
                color={mine ? "rgba(255,255,255,0.85)" : "#8A8A90"}
              />

              <Text
                style={[
                  styles.forwardedText,
                  mine && styles.forwardedTextMine,
                ]}>
                Forwarded
              </Text>
            </View>
          ) : null}

          {/* REPLY */}
          {msg.replyTo && !msg.deleted ? (
            <Pressable
              onPress={() => onReplyPress(msg.replyTo!.id)}
              style={[styles.replyPreview, mine && styles.replyPreviewMine]}>
              <View style={[styles.replyBar, mine && styles.replyBarMine]} />

              <View style={styles.replyBody}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.replyPreviewTitle,
                    mine && styles.replyPreviewTitleMine,
                  ]}>
                  {msg.replyTo.sender?.username || "Reply"}
                </Text>

                <View style={styles.replyLine}>
                  {replyIcon ? (
                    <Ionicons
                      name={replyIcon}
                      size={12}
                      color={mine ? "rgba(255,255,255,0.8)" : "#777783"}
                    />
                  ) : null}

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.replyPreviewText,
                      mine && styles.replyPreviewTextMine,
                    ]}>
                    {msg.replyTo.content ||
                      getMessageTypeLabel(msg.replyTo) ||
                      "Message"}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : null}

          {/* IMAGE */}
          {!msg.deleted && msg.kind === "image" && mediaUrl ? (
            <Pressable
              onPress={() => onMediaPress(msg)}
              onLongPress={() => onLongPress(msg)}
              delayLongPress={300}
              style={styles.mediaPressable}>
              <ChatImage uri={mediaUrl} style={styles.messageImage} />

              {msg.pending ? (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              ) : null}

              {metaVariant === "overlay" ? (
                <MessageMeta
                  msg={msg}
                  mine={mine}
                  pinned={pinned}
                  variant="overlay"
                  otherParticipant={otherParticipant}
                />
              ) : null}
            </Pressable>
          ) : null}

          {/* VIDEO */}
          {!msg.deleted && msg.kind === "video" && mediaUrl ? (
            <Pressable
              onPress={() => onMediaPress(msg)}
              onLongPress={() => onLongPress(msg)}
              delayLongPress={300}
              style={styles.videoMessage}>
              <VideoThumbnail key={mediaUrl} uri={mediaUrl} />

              <View style={styles.videoPlayOverlay}>
                {msg.pending ? (
                  <ActivityIndicator size="large" color="#FFFFFF" />
                ) : (
                  <Ionicons name="play-circle" size={52} color="#FFFFFF" />
                )}
              </View>

              {metaVariant === "overlay" ? (
                <MessageMeta
                  msg={msg}
                  mine={mine}
                  pinned={pinned}
                  variant="overlay"
                  otherParticipant={otherParticipant}
                />
              ) : null}
            </Pressable>
          ) : null}

          {/* AUDIO */}
          {!msg.deleted && msg.kind === "audio" ? (
            mediaUrl ? (
              <AudioBubble mediaUrl={mediaUrl} mine={mine} msg={msg} />
            ) : (
              <View style={styles.audioMessage}>
                <Ionicons
                  name="mic-outline"
                  size={18}
                  color={mine ? "#FFFFFF" : "#C5399A"}
                />

                <View style={styles.audioLine} />

                <Text style={[styles.audioText, mine && styles.audioTextMine]}>
                  Voice message
                </Text>
              </View>
            )
          ) : null}

          {/* DOCUMENT */}
          {!msg.deleted && msg.kind === "document" ? (
            <View
              style={[
                styles.documentMessage,
                mine && styles.documentMessageMine,
              ]}>
              <View style={styles.documentIcon}>
                <Ionicons name="document-text" size={23} color="#C5399A" />
              </View>

              <View style={styles.documentInfo}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.documentName,
                    mine && styles.documentNameMine,
                  ]}>
                  {msg.media?.name || msg.media?.filename || "Document"}
                </Text>

                <Text
                  style={[
                    styles.documentLabel,
                    mine && styles.documentLabelMine,
                  ]}>
                  {[
                    getFileExtension(msg.media?.name || msg.media?.filename),
                    formatFileSize(msg.media?.size),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Attachment"}
                </Text>
              </View>
            </View>
          ) : null}

          {/* CALL ENTRY (voice / video call history) */}
          {!msg.deleted && msg.kind === "call" ? (
            <CallLogContent
              msg={msg}
              mine={mine}
              onCallBack={onCallBack}
              onLongPress={() => onLongPress(msg)}
            />
          ) : null}

          {/* TEXT / CAPTION */}
          {text ? (
            <View style={hasMedia ? styles.captionWrap : undefined}>
              <Text
                style={[
                  styles.bubbleText,
                  mine && styles.bubbleTextMine,
                  msg.deleted && styles.deletedText,
                ]}>
                {/* Links in the message are clickable (post links open
                    inside the app, other links in the browser). */}
                {msg.deleted ? text : <LinkText text={text} mine={mine} />}
                <Text style={styles.metaSpacer}>{spacer}</Text>
              </Text>
            </View>
          ) : null}

          {/* TIME */}
          {metaVariant === "inline" ? (
            <MessageMeta
              msg={msg}
              mine={mine}
              pinned={pinned}
              variant="inline"
              otherParticipant={otherParticipant}
            />
          ) : null}

          {metaVariant === "flow" ? (
            <MessageMeta
              msg={msg}
              mine={mine}
              pinned={pinned}
              variant="flow"
              otherParticipant={otherParticipant}
            />
          ) : null}
        </Pressable>

        {/* REACTIONS */}
        {hasReactions ? (
          <View
            style={[
              styles.reactions,
              mine ? styles.reactionsMine : styles.reactionsTheirs,
            ]}>
            {getReactionCounts(msg.reactions!).map((reaction) => (
              <Pressable
                key={reaction.emoji}
                onPress={() => onReaction(msg, reaction.emoji)}
                style={[
                  styles.reactionBadge,
                  myReactionEmoji === reaction.emoji &&
                    styles.reactionBadgeActive,
                ]}>
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>

                {reaction.count > 1 ? (
                  <Text style={styles.reactionCount}>{reaction.count}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

// ==========================================
// RECORDING INDICATOR
// ==========================================

function RecordingIndicator({
  durationMillis,
  metering,
  cancelArmed,
}: {
  durationMillis: number;
  metering?: number;
  cancelArmed: boolean;
}) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.2,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [blink]);

  const level =
    typeof metering === "number"
      ? Math.max(0, Math.min(1, (metering + 60) / 60))
      : 0.35;

  const bars = [0.35, 0.6, 0.85, 0.5, 0.75, 1, 0.55, 0.8, 0.45, 0.7, 0.9, 0.4];

  const seconds = Math.max(0, Math.floor(durationMillis / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const timeLabel = `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;

  return (
    <View style={styles.recordingIndicator}>
      <Animated.View style={[styles.recordingDot, { opacity: blink }]} />

      <Text style={styles.recordingTime}>{timeLabel}</Text>

      <View style={styles.recordingWave}>
        {bars.map((bar, index) => (
          <View
            key={`recording-bar-${index}`}
            style={[
              styles.recordingBar,
              {
                height: 5 + bar * (6 + level * 14),
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.slideCancel}>
        <Ionicons
          name="chevron-back"
          size={14}
          color={cancelArmed ? "#D64545" : "#8A8A90"}
        />

        <Text
          style={[styles.slideCancelText, cancelArmed && styles.dangerText]}>
          {cancelArmed ? "Release to cancel" : "Slide to cancel"}
        </Text>
      </View>
    </View>
  );
}

// ==========================================
// VIDEO THUMBNAIL
// ==========================================
// Sent/received video bubbles used to show a plain camera icon until the
// user actually tapped and opened the video — WhatsApp shows the real
// first frame instead. This generates that frame once per video URI and
// caches it in memory so scrolling the list doesn't regenerate it.

const videoThumbnailCache = new Map<string, string>();

// ==========================================
// CHAT IMAGE
// ==========================================
// Two separate things going on here:
//  1) plain RN <Image> has weak/inconsistent caching (especially Android),
//     so a photo that's already been downloaded once still re-fetches over
//     the network every time it scrolls back into view or you revisit the
//     chat — that's the "loads late" you're seeing. Swapping to
//     expo-image with cachePolicy="memory-disk" fixes that: once fetched,
//     it's instant.
//  2) A message photo's image also has no background of its own, so while
//     it's genuinely loading for the very first time, you'd see straight
//     through to the bubble color behind it (pink for your own messages —
//     bubbleMine / #C5399A). This keeps the neutral placeholder + spinner
//     for that first-load case.

function ChatImage({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const [loading, setLoading] = useState(true);

  return (
    <View style={[style, styles.chatImageWrap]}>
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
        transition={150}
        onLoadEnd={() => setLoading(false)}
      />

      {loading ? (
        <View style={styles.chatImageLoading}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

// Cloudinary can give the first frame of any video as a picture, just by
// changing its link: .../video/upload/so_0,w_480,c_limit/.../clip.jpg
// (so_0 = frame at 0 seconds, w_480 = small, .jpg = as an image).
// Instant, cached, and works on phones AND the website — no need to
// download the video first.
function getCloudinaryVideoPoster(url: string): string | null {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return null;
  }

  const withoutQuery = url.split("?")[0];

  const withFrame = withoutQuery.replace(
    "/video/upload/",
    "/video/upload/so_0,w_480,c_limit/",
  );

  return withFrame.replace(/\.[a-z0-9]+$/i, ".jpg");
}

function VideoThumbnail({ uri }: { uri: string }) {
  const posterUrl = useMemo(() => getCloudinaryVideoPoster(uri), [uri]);

  const [posterFailed, setPosterFailed] = useState(false);

  const [thumbUri, setThumbUri] = useState<string | null>(
    videoThumbnailCache.get(uri) || null,
  );

  const usePoster = !!posterUrl && !posterFailed;

  // Only when there's no Cloudinary picture (e.g. a video still
  // uploading from THIS phone): make the frame from the file itself.
  // Not on the website — expo-video-thumbnails doesn't work there.
  useEffect(() => {
    if (usePoster || Platform.OS === "web" || videoThumbnailCache.has(uri)) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 0,
        });

        videoThumbnailCache.set(uri, thumb);

        if (!cancelled) {
          setThumbUri(thumb);
        }
      } catch {
        // Fall back to the placeholder below.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri, usePoster]);

  if (usePoster) {
    return (
      <ExpoImage
        source={{ uri: posterUrl! }}
        style={styles.videoThumbnailImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        onError={() => setPosterFailed(true)}
      />
    );
  }

  // Website: the browser draws the first frame itself.
  if (Platform.OS === "web") {
    return <VideoFirstFrame uri={uri} />;
  }

  if (thumbUri) {
    return (
      <Image
        source={{ uri: thumbUri }}
        style={styles.videoThumbnailImage}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={styles.videoThumbnailPlaceholder}>
      <Ionicons name="videocam-outline" size={34} color="#FFFFFF" />
    </View>
  );
}

function VideoViewer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.fullscreenVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

// ==========================================
// AUDIO BUBBLE
// ==========================================

const WAVE_BARS = 28;

// Long voice-note transcripts fold to a few lines with "See more".
const TRANSCRIPT_LONG_CHARS = 160;
const TRANSCRIPT_COLLAPSED_LINES = 3;

function getWaveform(seed: string) {
  let hash = 7;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }

  return Array.from({ length: WAVE_BARS }, () => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;

    return 0.25 + ((hash % 1000) / 1000) * 0.75;
  });
}

function AudioBubble({
  mediaUrl,
  mine,
  msg,
}: {
  mediaUrl: string;
  mine: boolean;
  msg: Message;
}) {
  const player = useAudioPlayer(mediaUrl);
  const status = useAudioPlayerStatus(player);

  const [waveWidth, setWaveWidth] = useState(0);

  const bars = useMemo(() => getWaveform(mediaUrl), [mediaUrl]);

  const duration =
    typeof status.duration === "number" && status.duration > 0
      ? status.duration
      : msg.media?.durationSeconds || 0;

  const currentTime =
    typeof status.currentTime === "number" ? status.currentTime : 0;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const playedColor = mine ? "#FFFFFF" : "#C5399A";
  const idleColor = mine ? "rgba(255,255,255,0.45)" : "#D8D8DF";

  const transcript = msg.media?.transcript;
  const transcribing = msg.media?.transcribing;
  const transcriptWords = msg.media?.transcriptWords;

  const [showTranscript, setShowTranscript] = useState(false);

  const hasTranscriptContent = Boolean(transcript || transcribing);

  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  const transcriptIsLong = (transcript?.length || 0) > TRANSCRIPT_LONG_CHARS;

  const transcriptCollapsed = transcriptIsLong && !transcriptExpanded;

  // 1× / 1.5× / 2× - remembered for the next voice notes.
  const [speed, setSpeed] = useState(getRememberedSpeed);

  const togglePlayback = () => {
    if (status.playing) {
      player.pause();
      return;
    }

    if (duration > 0 && currentTime >= duration - 0.05) {
      player.seekTo(0);
    }

    // Pressing play is the trigger — the transcript reveals itself the
    // moment you start listening rather than needing a separate tap on
    // a small icon first. Once shown it's never auto-hidden again (see
    // the render below — there's no toggle-off tied to playback ending),
    // so it stays in place after the audio finishes instead of vanishing.
    if (hasTranscriptContent) {
      setShowTranscript(true);
    }

    applySpeed(player, speed);
    player.play();
  };

  const changeSpeed = () => {
    const next = nextSpeed(speed);
    setSpeed(next);
    applySpeed(player, next);
  };

  const seekTo = (locationX: number) => {
    if (!waveWidth || duration <= 0) {
      return;
    }

    player.seekTo(
      (Math.max(0, Math.min(locationX, waveWidth)) / waveWidth) * duration,
    );
  };

  return (
    <View style={styles.audioWrap}>
      <View style={styles.audioMessage}>
        <Pressable
          onPress={togglePlayback}
          hitSlop={8}
          style={[styles.audioPlay, mine && styles.audioPlayMine]}
          accessibilityRole="button"
          accessibilityLabel={
            status.playing ? "Pause voice message" : "Play voice message"
          }>
          <Ionicons
            name={status.playing ? "pause" : "play"}
            size={18}
            color={mine ? "#C5399A" : "#FFFFFF"}
          />
        </Pressable>

        <View style={styles.audioBody}>
          <Pressable
            onLayout={(event) => setWaveWidth(event.nativeEvent.layout.width)}
            onPress={(event) => seekTo(event.nativeEvent.locationX)}
            style={styles.waveRow}>
            {bars.map((bar, index) => (
              <View
                key={`wave-${index}`}
                style={[
                  styles.waveBar,
                  {
                    height: 4 + bar * 18,
                    backgroundColor:
                      index / WAVE_BARS < progress ? playedColor : idleColor,
                  },
                ]}
              />
            ))}
          </Pressable>

          <View style={styles.audioMetaRow}>
            <Text style={[styles.audioText, mine && styles.audioTextMine]}>
              {formatDuration(
                status.playing || currentTime > 0 ? currentTime : duration,
              )}
            </Text>

            {/* Speed pill while playing (or paused partway), like WhatsApp */}
            {status.playing || currentTime > 0 ? (
              <SpeedPill speed={speed} onPress={changeSpeed} light={mine} />
            ) : null}
          </View>
        </View>

        {hasTranscriptContent ? (
          <Pressable
            onPress={() => setShowTranscript((current) => !current)}
            hitSlop={8}
            style={styles.transcriptToggle}
            accessibilityRole="button"
            accessibilityLabel={
              showTranscript ? "Hide transcript" : "Show transcript"
            }>
            <Ionicons
              name={showTranscript ? "chevron-up" : "text-outline"}
              size={16}
              color={mine ? "rgba(255,255,255,0.85)" : "#8A8A90"}
            />
          </Pressable>
        ) : null}
      </View>

      {showTranscript ? (
        <View style={styles.transcriptBox}>
          {transcribing && !transcript ? (
            <View style={styles.transcriptLoadingRow}>
              <ActivityIndicator
                size="small"
                color={mine ? "#FFFFFF" : "#C5399A"}
              />

              <Text
                style={[
                  styles.transcriptLoadingText,
                  mine && styles.transcriptTextMine,
                ]}>
                Transcribing…
              </Text>
            </View>
          ) : transcriptWords && transcriptWords.length > 0 ? (
            // Karaoke-style sync: each word is its own Text node so the
            // one currently being spoken can be highlighted on its own.
            // "Currently being spoken" only actually moves while
            // status.playing — once paused or finished, whichever word
            // was last active just stays highlighted rather than
            // snapping back, so the transcript still reads naturally as
            // a finished block of text.
            <Text
              numberOfLines={
                transcriptCollapsed ? TRANSCRIPT_COLLAPSED_LINES : undefined
              }
              style={[
                styles.transcriptText,
                mine && styles.transcriptTextMine,
              ]}>
              {transcriptWords.map((item, index) => {
                const isActive =
                  status.playing &&
                  currentTime >= item.start &&
                  currentTime < item.end;

                return (
                  <Text
                    key={`${item.word}-${index}`}
                    style={
                      isActive
                        ? mine
                          ? styles.transcriptWordActiveMine
                          : styles.transcriptWordActive
                        : undefined
                    }>
                    {item.word}
                    {index < transcriptWords.length - 1 ? " " : ""}
                  </Text>
                );
              })}
            </Text>
          ) : (
            // Fallback for messages transcribed before word-level timing
            // existed, or if the backend didn't return any words — plain,
            // unsynced text is still better than nothing.
            <Text
              numberOfLines={
                transcriptCollapsed ? TRANSCRIPT_COLLAPSED_LINES : undefined
              }
              style={[
                styles.transcriptText,
                mine && styles.transcriptTextMine,
              ]}>
              {transcript}
            </Text>
          )}

          {transcriptIsLong && transcript ? (
            <Pressable
              onPress={() => setTranscriptExpanded((current) => !current)}
              hitSlop={6}
              accessibilityRole="button">
              <Text
                style={[
                  styles.transcriptMore,
                  mine && styles.transcriptMoreMine,
                ]}>
                {transcriptExpanded ? "See less" : "See more"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ==========================================
// CALL ENTRY (like WhatsApp's call history in a chat)
// ==========================================
// Worded from THIS person's side. The sender of a call entry is always
// the caller, so `mine` = "I made this call".
//
//   what happened   caller sees                 other person sees
//   answered        Voice call  ↗ 2:31          Voice call  ↙ 2:31
//   rang out        Voice call  ↗ No answer     Missed voice call (red)
//   declined        Voice call  ↗ Declined      You declined a voice call
//   cancelled       Voice call  ↗ Cancelled     Missed voice call (red)
//
// Tapping it calls back (same type: voice or video).

function CallLogContent({
  msg,
  mine,
  onCallBack,
  onLongPress,
}: {
  msg: Message;
  mine: boolean;
  onCallBack: (type: "audio" | "video") => void;
  onLongPress: () => void;
}) {
  const log = msg.callLog || {};
  const video = log.type === "video";
  const status = log.status;
  const answered = status === "ended";
  const kindName = video ? "video call" : "voice call";

  // Red "missed" style: only for the person who was called and didn't pick up.
  const missedForMe = !mine && (status === "missed" || status === "cancelled");

  const title =
    answered || mine
      ? video
        ? "Video call"
        : "Voice call"
      : status === "declined"
        ? `You declined a ${kindName}`
        : `Missed ${kindName}`;

  const detail = answered
    ? formatDuration(log.durationSeconds || 0)
    : mine
      ? status === "declined"
        ? "Declined"
        : status === "missed"
          ? "No answer"
          : "Cancelled"
      : "Tap to call back";

  const textColor = mine ? "#FFFFFF" : missedForMe ? "#E5484D" : "#191922";
  const subColor = mine ? "rgba(255,255,255,0.8)" : "#8A8A90";
  const arrowColor = missedForMe ? "#E5484D" : mine ? "#FFFFFF" : "#2FB36B";

  return (
    <Pressable
      onPress={() => onCallBack(video ? "video" : "audio")}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={styles.callLog}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}. Tap to call back.`}>
      <View
        style={[
          styles.callLogIcon,
          mine ? styles.callLogIconMine : styles.callLogIconTheirs,
          missedForMe && styles.callLogIconMissed,
        ]}>
        <Ionicons
          name={video ? "videocam" : "call"}
          size={18}
          color={missedForMe ? "#E5484D" : "#C5399A"}
        />
      </View>

      <View style={styles.callLogText}>
        <Text
          style={[styles.callLogTitle, { color: textColor }]}
          numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.callLogDetailRow}>
          {/* ↗ outgoing / ↙ incoming, like WhatsApp */}
          <Ionicons
            name={mine ? "arrow-up" : "arrow-down"}
            size={12}
            color={arrowColor}
            style={{ transform: [{ rotate: "45deg" }] }}
          />
          <Text style={[styles.callLogDetail, { color: subColor }]}>
            {detail}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ==========================================
// MENU ITEM
// ==========================================

function MenuItem({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuItemText, danger && styles.dangerText]}>
        {label}
      </Text>

      <Ionicons name={icon} size={20} color={danger ? "#D64545" : "#C5399A"} />
    </Pressable>
  );
}

// ==========================================
// CHAT SCREEN
// ==========================================

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const conversationId = Array.isArray(id) ? id[0] : id;

  const token = useAppSelector((state) => state.auth.token);

  const authUser = useAppSelector((state) => state.auth.user);

  const currentUserId = authUser?.id || (authUser as any)?._id || "";

  const currentUsername =
    authUser?.profile?.username ||
    (authUser as any)?.profile?.handle ||
    (authUser as any)?.username ||
    "";

  const conversation = useAppSelector(
    (state) =>
      state.chat.conversationDetails[conversationId] ||
      state.chat.conversations.find((chat) => chat.id === conversationId),
  ) as Chat | undefined;

  const conversations = useAppSelector((state) => state.chat.conversations);

  const messages = useAppSelector(
    (state) =>
      (state.chat.messages[conversationId] || EMPTY_MESSAGES) as Message[],
  );

  const messagesLoading = useAppSelector(
    (state) => !!state.chat.messagesLoading[conversationId],
  );

  const selectedIds = useAppSelector(
    (state) =>
      state.chat.selectedMessageIds[conversationId] || EMPTY_MESSAGE_IDS,
  );

  const pinnedIds = useAppSelector(
    (state) => state.chat.pinnedMessageIds[conversationId] || EMPTY_MESSAGE_IDS,
  );

  const searchedUsers = useAppSelector((state) => state.chat.searchedUsers);

  const usersLoading = useAppSelector((state) => state.chat.usersLoading);

  // Calls: true while a call is being started (prevents double taps).
  const callStarting = useAppSelector((state) => state.call.starting);

  const listRef = useRef<FlatList<Message>>(null);

  const inputRef = useRef<TextInput>(null);

  const [draft, setDraft] = useState("");
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

  // Optimistic delete: deleteForMe/deleteForEveryone/deleteSelectedFor add
  // ids here immediately so the message grays out/disappears right away,
  // instead of waiting for the network round-trip to update Redux. Rolled
  // back (id removed) if the delete actually fails.
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<Set<string>>(
    new Set(),
  );

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  const recorderState = useAudioRecorderState(audioRecorder);

  const recorderStateRef = useRef(recorderState);

  recorderStateRef.current = recorderState;

  const [recordingBusy, setRecordingBusy] = useState(false);
  const recordingPressActive = useRef(false);
  const releasedCancelled = useRef(false);
  const cancelArmedRef = useRef(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");

  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [showActions, setShowActions] = useState(false);

  // When the long-press menu opened (see MENU_TAP_GUARD_MS) and a short
  // "Copied ✓" note shown inside it.
  const menuOpenedAtRef = useRef(0);
  const [menuNotice, setMenuNotice] = useState("");

  // The "Delete for everyone / Delete for me" sheet (one or several messages).
  const [deleteSheet, setDeleteSheet] = useState<{
    messages: Message[];
    single: boolean;
  } | null>(null);

  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentDraft, setAttachmentDraft] =
    useState<AttachmentDraft | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState("");
  const [attachmentSending] = useState(false);

  const [mediaViewer, setMediaViewer] = useState<Message | null>(null);

  const [showForwardModal, setShowForwardModal] = useState(false);

  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);

  const [userSearch, setUserSearch] = useState("");

  const [selectionMode, setSelectionMode] = useState(false);

  const [showJumpButton, setShowJumpButton] = useState(false);

  const [newMessageCount, setNewMessageCount] = useState(0);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [infoMessage, setInfoMessage] = useState<Message | null>(null);

  // CHAT WALLPAPER: this chat's saved wallpaper, plus a live preview while
  // the picker is open.
  const savedWallpaper = useChatWallpaper(conversationId);
  const [wallpaperPreview, setWallpaperPreview] = useState<Wallpaper | null>(
    null,
  );
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const shownWallpaper = wallpaperPreview || savedWallpaper;

  // ⋮ CHAT MENU, PROFILE AND BLOCK (DMs)
  const [showChatMenu, setShowChatMenu] = useState(false);
  // The username (lower-case) I've blocked in this chat, if any.
  const [blockedName, setBlockedName] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  const otherUsername = (
    conversation?.type === "dm"
      ? conversation.otherParticipant?.username || ""
      : ""
  ).replace(/^@/, "");

  const iBlockedThem =
    !!otherUsername && blockedName === otherUsername.toLowerCase();

  // Did I block this person? (Then the message box is replaced.)
  // State is only set after the server answers (React Compiler rule).
  useEffect(() => {
    if (!token || !otherUsername) {
      return;
    }

    let cancelled = false;

    getBlockedUsernames(token)
      .then((names) => {
        if (!cancelled) {
          const name = otherUsername.toLowerCase();
          setBlockedName(names.has(name) ? name : null);
        }
      })
      .catch(() => {
        // Can't tell - leave the chat as it is.
      });

    return () => {
      cancelled = true;
    };
  }, [token, otherUsername]);

  const openTheirProfile = () => {
    if (!otherUsername) {
      return;
    }

    setShowChatMenu(false);
    router.push({
      pathname: "/user/[username]",
      params: { username: otherUsername },
    });
  };

  const confirmBlock = () => {
    setShowChatMenu(false);

    if (!token || !otherUsername) {
      return;
    }

    Alert.alert(
      `Block @${otherUsername}?`,
      "They won't be able to message you, call you or see your profile. They won't be told you blocked them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              setBlockBusy(true);
              await blockUser(otherUsername, token);
              setBlockedName(otherUsername.toLowerCase());
            } catch (error) {
              Alert.alert(
                "Block",
                error instanceof Error ? error.message : "Could not block.",
              );
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ],
    );
  };

  const doUnblock = async () => {
    setShowChatMenu(false);

    if (!token || !otherUsername) {
      return;
    }

    try {
      setBlockBusy(true);
      await unblockUser(otherUsername, token);
      setBlockedName(null);
    } catch (error) {
      Alert.alert(
        "Unblock",
        error instanceof Error ? error.message : "Could not unblock.",
      );
    } finally {
      setBlockBusy(false);
    }
  };
  const [infoLoading, setInfoLoading] = useState(false);

  // Tracks whether the keyboard is currently up so the composer's bottom
  // padding can drop the safe-area inset while the keyboard (rather than
  // the home indicator) is what's actually sitting at the bottom of the
  // screen. Without this, insets.bottom was being added on TOP of the
  // keyboard's own height, producing the large WhatsApp-unlike gap.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Typing state now lives globally in chatSlice (typingByConversation)
  // rather than as local component state — the Direct Message list
  // needs the same "is the other person typing" signal for a
  // conversation you haven't opened, so this reads the same single
  // source of truth instead of maintaining its own copy.
  const otherTyping = useAppSelector(
    (state) => !!state.chat.typingByConversation[conversationId],
  );

  // Throttles our OWN typing:start emits (so every keystroke doesn't
  // send a socket event) and debounces the typing:stop that follows a
  // pause — same pattern WhatsApp/iMessage use.
  const ownTypingActiveRef = useRef(false);
  const ownTypingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const seenBy = useAppSelector((state) =>
    infoMessage
      ? state.chat.seenByMessage[`${conversationId}:${infoMessage.id}`]
      : undefined,
  ) as SeenPerson[] | undefined;

  const previousMessageCount = useRef(messages.length);

  const groupChat =
    conversation?.type === "community" || conversation?.type === "faction";

  // Calls are DM-only (the backend rejects calls in community/faction).
  const canCall = conversation?.type === "dm";

  const visibleMessages = useMemo(() => {
    // Hide each pending bubble whose real copy has already arrived. Each
    // real message can only "use up" one pending bubble, so sending the
    // same text twice quickly still shows both.
    const usedRealIds = new Set<string>();

    const stillPending = pendingMessages.filter((pending) => {
      const match = messages.find(
        (real) =>
          !usedRealIds.has(real.id) &&
          isRealCopyOfPending(real, pending, currentUserId),
      );

      if (match) {
        usedRealIds.add(match.id);
        return false;
      }

      return true;
    });

    const merged = [...stillPending, ...messages];

    if (locallyDeletedIds.size === 0) {
      return merged;
    }

    return merged.map((message) =>
      locallyDeletedIds.has(message.id) && !message.deleted
        ? { ...message, deleted: true }
        : message,
    );
  }, [pendingMessages, messages, locallyDeletedIds, currentUserId]);

  // Stable extraData for the FlatList. Previously this was an inline object
  // literal created fresh on every render, which made the FlatList believe
  // extraData had changed on every render (including the 5s poll tick) and
  // re-render every visible Bubble. Memoizing it, together with wrapping
  // Bubble in memo() above, means a bubble only re-renders when something
  // it actually depends on changes.
  const listExtraData = useMemo(
    () => ({
      selectedIds,
      pinnedIds,
      highlightedId,
      selectionMode,
      currentUserId,
      currentUsername,
      otherParticipantOnline: conversation?.otherParticipant?.isOnline,
      otherParticipantLastReadAt: conversation?.otherParticipant?.lastReadAt,
    }),
    [
      selectedIds,
      pinnedIds,
      highlightedId,
      selectionMode,
      currentUserId,
      currentUsername,
      conversation?.otherParticipant?.isOnline,
      conversation?.otherParticipant?.lastReadAt,
    ],
  );

  const addPendingMessage = (message: Omit<Message, "id" | "pending">) => {
    const id = generateLocalId("pending");
    setPendingMessages((current) => [
      { ...message, id, conversationId, pending: true },
      ...current,
    ]);
    return id;
  };

  const removePendingMessage = (id: string) => {
    setPendingMessages((current) => current.filter((item) => item.id !== id));
  };

  // ========================================
  // HEADER
  // ========================================

  const headerName = useMemo(() => {
    if (!conversation) {
      return "Chat";
    }

    if (conversation.type === "dm") {
      return (
        conversation.title || conversation.otherParticipant?.username || "Chat"
      );
    }

    return (
      conversation.title ||
      (conversation.type === "faction" ? "Faction" : "Community")
    );
  }, [conversation]);

  const headerStatus = useMemo(() => {
    if (conversation?.type === "dm") {
      if (otherTyping) {
        return "typing...";
      }

      if (conversation.otherParticipant?.isOnline) {
        return "online";
      }

      return formatLastSeen(conversation.otherParticipant?.lastActiveAt);
    }

    if (conversation?.memberCount) {
      return `${conversation.memberCount} members`;
    }

    return "Community";
  }, [conversation, otherTyping]);

  const headerAvatar =
    conversation?.type === "dm"
      ? getAvatar(conversation.otherParticipant)
      : null;

  // ========================================
  // PINNED
  // ========================================

  const pinnedMessageId = pinnedIds[0];

  const pinnedMessage = pinnedMessageId
    ? messages.find((message) => message.id === pinnedMessageId)
    : undefined;

  // ========================================
  // OWNERSHIP
  // ========================================

  const isMyMessage = (message: Message) => {
    const senderId = message.sender?.id || message.sender?._id || "";

    const senderUsername = message.sender?.username || "";

    const normalizedCurrentUsername = currentUsername
      .replace(/^@/, "")
      .toLowerCase();

    const normalizedSenderUsername = senderUsername
      .replace(/^@/, "")
      .toLowerCase();

    if (
      currentUserId &&
      senderId &&
      String(currentUserId) === String(senderId)
    ) {
      return true;
    }

    if (
      normalizedCurrentUsername &&
      normalizedSenderUsername &&
      normalizedCurrentUsername === normalizedSenderUsername
    ) {
      return true;
    }

    return false;
  };

  const getSenderKey = (message: Message) => {
    if (isMyMessage(message)) {
      return "me";
    }

    return String(
      message.sender?.id ||
        message.sender?._id ||
        message.sender?.username ||
        "unknown",
    );
  };

  const findMyReaction = (message: Message) =>
    (message.reactions || []).find((reaction) => {
      if (reaction.mine === true) {
        return true;
      }

      const sameId =
        !!currentUserId &&
        !!reaction.userId &&
        String(reaction.userId) === String(currentUserId);

      const sameUsername =
        !!currentUsername &&
        !!reaction.username &&
        reaction.username.replace(/^@/, "").toLowerCase() ===
          currentUsername.replace(/^@/, "").toLowerCase();

      return sameId || sameUsername;
    });

  // ========================================
  // LOAD
  // ========================================
  // useFocusEffect (not a plain useEffect) so this reruns every time the
  // screen regains focus, not just on first mount. A plain useEffect only
  // fires again if conversationId/token change — if navigation keeps this
  // screen instance alive (e.g. going to the media viewer and back, or
  // switching tabs), leaving and returning wouldn't refetch anything and
  // you'd sit looking at stale/blank content until the next 5s poll tick.

  useFocusEffect(
    useCallback(() => {
      if (!token || !conversationId) {
        return;
      }

      dispatch(
        fetchConversation({
          conversationId,
          token,
        }),
      );

      dispatch(
        fetchMessages({
          conversationId,
          token,
        }),
      );

      dispatch(
        readConversation({
          conversationId,
          token,
        }),
      );
    }, [conversationId, token, dispatch]),
  );

  // ========================================
  // SAFETY-NET POLLING
  // ========================================
  // Sockets (below) are now the primary way updates arrive. This just
  // guards against a missed event — a brief disconnect, a dropped
  // packet — so it runs far less often than before and no longer needs
  // the old "is something still transcribing" special case, since
  // message:edited now delivers a finished transcript live.

  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!token || !conversationId) {
      return;
    }

    const interval = setInterval(() => {
      dispatch(
        fetchMessages({
          conversationId,
          token,
          after: messagesRef.current[0]?.id,
          mode: "append",
        }),
      );

      if (conversationRef.current?.unreadCount) {
        dispatch(
          readConversation({
            conversationId,
            token,
          }),
        );
      }
    }, SAFETY_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [conversationId, token, dispatch]);

  // ========================================
  // SOCKET — LIVE UPDATES
  // ========================================
  // Joins this conversation's room (matching the backend's
  // conversation:join ack pattern in src/realtime/socket.js) and wires
  // each event straight into the same chatSlice reducers a REST
  // response would use — see socketMessageReceived/socketMessageEdited/
  // etc. Each handler filters to this conversationId since a single
  // socket can be joined to other rooms too (the account-wide
  // user:<id> room, or a conversation left open in another screen).
  //
  // The connection itself is established once, at the app root, by
  // useSocketConnection() — this effect only joins/leaves the room and
  // attaches listeners; it never calls connectSocket itself.

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const socket = getSocket();

    if (!socket) {
      // Not connected yet (e.g. the app-root connection is still being
      // established) — the safety-net poll above covers this gap until
      // a reconnect happens; there's nothing to join yet.
      return;
    }

    let cancelled = false;

    // READ RECEIPTS: while this chat is open, anything that arrives is
    // being read right now — tell the backend so the sender's ticks turn
    // pink immediately (the backend emits chat:read to them). Grouped
    // into one request if several messages arrive together.
    let markReadTimer: ReturnType<typeof setTimeout> | null = null;

    const markReadSoon = () => {
      if (!token) {
        return;
      }

      if (markReadTimer) {
        clearTimeout(markReadTimer);
      }

      markReadTimer = setTimeout(() => {
        markReadTimer = null;
        dispatch(readConversation({ conversationId, token }));
      }, 400);
    };

    const doJoin = () => {
      joinConversation(conversationId).then((ack) => {
        if (!ack.ok && !cancelled) {
          console.error("CONVERSATION JOIN FAILED:", ack.error);
        }
      });

      // Covers coming back to the app with this chat still open.
      markReadSoon();
    };

    doJoin();

    // Room membership lives in the socket server's memory tied to one
    // physical connection — a dropped connection (a subway tunnel, wifi
    // handoff, backgrounding the app) means the reconnected socket is a
    // NEW connection that was never told to join this room. Without
    // this, a brief network blip would silently stop delivering events
    // for the rest of the time this screen stays open, with no visible
    // error — it'd just quietly fall back to the 30s safety poll.
    socket.on("connect", doJoin);

    const handleMessageNew = (payload: {
      conversationId: string;
      message: Message;
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      // Dedup happens inside the reducer itself — if this is a message
      // you just sent (already added by createMessage's own .fulfilled
      // case), this is a safe no-op.
      dispatch(socketMessageReceived(payload));

      // Someone else's message arrived while I'm looking at the chat.
      const senderId =
        payload.message?.sender?.id || payload.message?.sender?._id || "";

      if (!senderId || String(senderId) !== String(currentUserId)) {
        markReadSoon();
      }

      scrollToLatestIfNeeded();
    };

    const handleMessageEdited = (payload: {
      conversationId: string;
      message: Message;
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      dispatch(socketMessageEdited(payload));
    };

    const handleMessageDeleted = (payload: {
      conversationId: string;
      messageId: string;
      scope: string;
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      dispatch(socketMessageDeleted(payload));
    };

    const handleMessageReaction = (payload: {
      conversationId: string;
      messageId: string;
      reactions: Reaction[];
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      dispatch(socketMessageReaction(payload));
    };

    const handleChatPinned = (payload: {
      conversationId: string;
      pinnedMessage: { id: string } | null;
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      dispatch(socketChatPinned(payload));
    };

    const handleChatRead = (payload: {
      conversationId: string;
      userId: string;
      lastReadAt: string;
    }) => {
      if (payload.conversationId !== conversationId) {
        return;
      }

      dispatch(socketChatRead({ ...payload, currentUserId }));
    };

    socket.on("message:new", handleMessageNew);
    socket.on("message:edited", handleMessageEdited);
    socket.on("message:deleted", handleMessageDeleted);
    socket.on("message:reaction", handleMessageReaction);
    socket.on("chat:pinned", handleChatPinned);
    socket.on("chat:read", handleChatRead);

    return () => {
      cancelled = true;

      if (markReadTimer) {
        clearTimeout(markReadTimer);
      }

      socket.off("connect", doJoin);
      socket.off("message:new", handleMessageNew);
      socket.off("message:edited", handleMessageEdited);
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("message:reaction", handleMessageReaction);
      socket.off("chat:pinned", handleChatPinned);
      socket.off("chat:read", handleChatRead);

      leaveConversation(conversationId);
    };
  }, [conversationId, dispatch, currentUserId, token]);

  // ========================================
  // USER SEARCH
  // ========================================

  useEffect(() => {
    if (!token) {
      return;
    }

    const search = userSearch.trim();

    if (!search) {
      return;
    }

    const timer = setTimeout(() => {
      dispatch(
        searchUsers({
          search,
          token,
        }),
      );
    }, 350);

    return () => clearTimeout(timer);
  }, [userSearch, token, dispatch]);

  // ========================================
  // NEW MESSAGE DETECTION
  // ========================================

  useEffect(() => {
    if (messages.length > previousMessageCount.current) {
      if (showJumpButton) {
        const difference = messages.length - previousMessageCount.current;

        setNewMessageCount((current) => current + difference);
      }
    }

    previousMessageCount.current = messages.length;
  }, [messages.length, showJumpButton]);

  // ========================================
  // SCROLL TO A MESSAGE (reply tap / pinned banner)
  // ========================================

  const scrollToMessage = (messageId: string) => {
    const index = visibleMessages.findIndex((item) => item.id === messageId);

    if (index < 0) {
      return;
    }

    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.5,
    });

    setHighlightedId(messageId);

    setTimeout(() => {
      setHighlightedId((current) => (current === messageId ? null : current));
    }, 1600);
  };

  // ========================================
  // VOICE MESSAGE
  // ========================================

  const showVoiceHint = (text: string) => {
    setVoiceHint(text);

    setTimeout(() => setVoiceHint(""), 2200);
  };

  const startVoiceRecording = async () => {
    if (
      !token ||
      !conversationId ||
      recordingBusy ||
      audioRecorder.isRecording
    ) {
      return;
    }

    try {
      setRecordingBusy(true);

      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone permission",
          "Please allow CosQuest to access your microphone to record a voice message.",
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert(
        "Voice message",
        error instanceof Error
          ? error.message
          : "Unable to start voice recording.",
      );
    } finally {
      setRecordingBusy(false);
    }
  };

  const finishVoiceRecording = async (cancelled: boolean) => {
    if (!token || !conversationId || !audioRecorder.isRecording) {
      return;
    }

    const durationMillis = Math.max(
      recorderStateRef.current.durationMillis || 0,
      ((audioRecorder as any).currentTime || 0) * 1000,
    );

    try {
      setRecordingBusy(true);

      await audioRecorder.stop();

      const uri = audioRecorder.uri;

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (cancelled) {
        return;
      }

      if (durationMillis < MIN_VOICE_MILLIS) {
        showVoiceHint("Hold to record, release to send");
        return;
      }

      if (!uri) {
        throw new Error("The voice recording could not be created.");
      }

      const voiceFileName = generateVoiceFileName();

      const pendingId = addPendingMessage({
        sender: {
          id: currentUserId,
          username: currentUsername,
        },
        kind: "audio",
        createdAt: new Date().toISOString(),
        media: {
          uri,
          name: voiceFileName,
          type: "audio/mp4",
        },
      });

      try {
        await dispatch(
          createMessage({
            conversationId,
            token,
            data: {
              kind: "audio",
              file: {
                uri,
                name: voiceFileName,
                type: "audio/mp4",
              },
            },
          }),
        ).unwrap();
      } catch (error) {
        removePendingMessage(pendingId);
        throw error;
      }

      removePendingMessage(pendingId);

      scrollToLatestIfNeeded();
    } catch (error) {
      console.error("VOICE MESSAGE SEND ERROR:", error);

      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
      } catch {
        // Ignore audio-session cleanup errors after a failed recording.
      }

      Alert.alert(
        "Voice message",
        error instanceof Error
          ? error.message
          : "Unable to send voice message.",
      );
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleVoiceGrant = async () => {
    if (editingMessage || draft.trim() || recordingBusy) {
      return;
    }

    recordingPressActive.current = true;
    releasedCancelled.current = false;
    cancelArmedRef.current = false;
    setCancelArmed(false);

    await startVoiceRecording();

    // The finger was lifted while the permission prompt / native recorder
    // was still starting, so finish as soon as recording is running.
    if (!recordingPressActive.current && audioRecorder.isRecording) {
      await finishVoiceRecording(releasedCancelled.current);
    }
  };

  const handleVoiceMove = (dx: number) => {
    const armed = dx < VOICE_CANCEL_THRESHOLD;

    if (armed !== cancelArmedRef.current) {
      cancelArmedRef.current = armed;
      setCancelArmed(armed);
    }
  };

  const handleVoiceRelease = async (dx: number) => {
    recordingPressActive.current = false;

    const cancelled = dx < VOICE_CANCEL_THRESHOLD;

    releasedCancelled.current = cancelled;
    cancelArmedRef.current = false;
    setCancelArmed(false);

    if (audioRecorder.isRecording) {
      await finishVoiceRecording(cancelled);
    }
  };

  const voiceHandlers = useRef({
    grant: handleVoiceGrant,
    move: handleVoiceMove,
    release: handleVoiceRelease,
  });

  voiceHandlers.current = {
    grant: handleVoiceGrant,
    move: handleVoiceMove,
    release: handleVoiceRelease,
  };

  const micPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        voiceHandlers.current.grant();
      },
      onPanResponderMove: (_, gesture) => {
        voiceHandlers.current.move(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        voiceHandlers.current.release(gesture.dx);
      },
      // Interrupted (e.g. by the permission dialog): discard the recording.
      onPanResponderTerminate: () => {
        voiceHandlers.current.release(-9999);
      },
    }),
  ).current;

  // ========================================
  // TYPING
  // ========================================
  // Throttled/debounced the way WhatsApp/iMessage do it: typing:start
  // fires once when you start (not on every keystroke), and typing:stop
  // fires automatically after a short pause rather than needing an
  // explicit "done typing" action.

  const handleDraftChange = (text: string) => {
    setDraft(text);

    if (!conversationId) {
      return;
    }

    if (text.trim()) {
      if (!ownTypingActiveRef.current) {
        ownTypingActiveRef.current = true;
        startTyping(conversationId);
      }

      if (ownTypingStopTimeoutRef.current) {
        clearTimeout(ownTypingStopTimeoutRef.current);
      }

      ownTypingStopTimeoutRef.current = setTimeout(() => {
        ownTypingActiveRef.current = false;
        stopTyping(conversationId);
      }, 2500);
    } else if (ownTypingActiveRef.current) {
      // Cleared the input entirely — stop immediately rather than
      // waiting out the debounce timer.
      if (ownTypingStopTimeoutRef.current) {
        clearTimeout(ownTypingStopTimeoutRef.current);
        ownTypingStopTimeoutRef.current = null;
      }

      ownTypingActiveRef.current = false;
      stopTyping(conversationId);
    }
  };

  // ========================================
  // SEND
  // ========================================

  const send = async () => {
    const text = draft.trim();

    if (!text || !token || !conversationId) {
      return;
    }

    // Capture what we need before clearing state — setReplyingTo/setDraft
    // below won't affect these local variables within this call.
    const replyToId = replyingTo?.id;

    // Clear the composer right away, WhatsApp-style: the pending bubble
    // below already shows the message in the list, so there's no reason
    // to keep the typed text sitting in the input while we wait on the
    // network. If the send fails we restore it (see catch below).
    setDraft("");
    setReplyingTo(null);
    setEditingMessage(null);

    if (ownTypingActiveRef.current) {
      if (ownTypingStopTimeoutRef.current) {
        clearTimeout(ownTypingStopTimeoutRef.current);
        ownTypingStopTimeoutRef.current = null;
      }

      ownTypingActiveRef.current = false;
      stopTyping(conversationId);
    }

    const pendingId = addPendingMessage({
      sender: {
        id: currentUserId,
        username: currentUsername,
      },
      kind: "text",
      content: text,
      createdAt: new Date().toISOString(),
    });

    try {
      await dispatch(
        createMessage({
          conversationId,
          token,
          data: {
            content: text,
            replyTo: replyToId,
          },
        }),
      ).unwrap();

      removePendingMessage(pendingId);

      scrollToLatestIfNeeded();
    } catch (error) {
      removePendingMessage(pendingId);

      // Give the text back so nothing is lost on failure.
      setDraft(text);

      Alert.alert(
        "Message",
        error instanceof Error ? error.message : "Unable to send message.",
      );
    }
  };

  // ========================================
  // EDIT
  // ========================================

  const startEditing = (message: Message) => {
    if (!isMyMessage(message)) {
      return;
    }

    setSelectedMessage(null);

    setShowActions(false);

    setEditingMessage(message);

    setReplyingTo(null);

    setDraft(message.content || "");

    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const saveEdit = async () => {
    const text = draft.trim();

    if (!text || !editingMessage || !token || !conversationId) {
      return;
    }

    if (!isMyMessage(editingMessage)) {
      Alert.alert("Edit message", "You can only edit your own message.");

      return;
    }

    const target = editingMessage;

    // Same optimistic clear as send(): don't make the user watch the
    // input sit there while the edit round-trips.
    setEditingMessage(null);
    setDraft("");

    try {
      await dispatch(
        editMessage({
          conversationId,
          messageId: target.id,
          token,
          data: {
            content: text,
          },
        }),
      ).unwrap();
    } catch (error) {
      // Put the user back into edit mode with their text so nothing is lost.
      setEditingMessage(target);
      setDraft(text);

      Alert.alert(
        "Edit message",
        error instanceof Error ? error.message : "Unable to edit message.",
      );
    }
  };

  // ========================================
  // DELETE
  // ========================================

  const deleteForMe = async (message: Message) => {
    if (!token || !conversationId) {
      return;
    }

    setShowActions(false);

    setSelectedMessage(null);

    // Show it as deleted right away instead of waiting on the network —
    // this was the main source of "delete feels slow".
    setLocallyDeletedIds((current) => new Set(current).add(message.id));

    try {
      await dispatch(
        removeMessage({
          conversationId,
          messageId: message.id,
          token,
          scope: "me",
        }),
      ).unwrap();
    } catch (error) {
      // Roll back — it wasn't actually deleted.
      setLocallyDeletedIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });

      Alert.alert(
        "Delete message",
        error instanceof Error ? error.message : "Unable to delete message.",
      );
    }
  };

  const deleteForEveryone = async (message: Message) => {
    if (!token || !conversationId) {
      return;
    }

    if (!isMyMessage(message)) {
      Alert.alert(
        "Delete message",
        "You can only delete your own message for everyone.",
      );

      return;
    }

    setShowActions(false);

    setSelectedMessage(null);

    setLocallyDeletedIds((current) => new Set(current).add(message.id));

    try {
      await dispatch(
        removeMessage({
          conversationId,
          messageId: message.id,
          token,
          scope: "everyone",
        }),
      ).unwrap();
    } catch (error) {
      setLocallyDeletedIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });

      Alert.alert(
        "Delete message",
        error instanceof Error ? error.message : "Unable to delete message.",
      );
    }
  };

  // WhatsApp-style: one "Delete" entry, then choose who to delete for.
  // WhatsApp-style: one "Delete" entry, then choose who to delete for -
  // in our own sheet (works the same on phones and the website).
  const deletePrompt = (message: Message) => {
    setShowActions(false);
    setDeleteSheet({ messages: [message], single: true });
  };

  // ========================================
  // COPY
  // ========================================

  // Stays in the menu (shows "Copied ✓") so you can do more.
  const copyMessage = async (message: Message) => {
    const text = message.content?.trim();

    if (!text) {
      showMenuNotice("No text to copy");
      return;
    }

    try {
      await Clipboard.setStringAsync(text);
      showMenuNotice("Copied ✓");
    } catch {
      showMenuNotice("Couldn't copy");
    }
  };

  // ========================================
  // COPY LINK
  // ========================================

  const copyMessageLink = async (message: Message) => {
    if (!token || !conversationId) {
      return;
    }

    try {
      const result = await dispatch(
        fetchMessageShare({
          conversationId,
          messageId: message.id,
          token,
        }),
      ).unwrap();

      const link =
        result.link ||
        `cosquest://chat/${conversationId}/message/${message.id}`;

      await Clipboard.setStringAsync(link);

      // Stays in the menu so you can do more.
      showMenuNotice("Link copied ✓");
    } catch (error) {
      Alert.alert(
        "Copy link",
        error instanceof Error
          ? error.message
          : "Unable to create message link.",
      );
    }
  };

  // ========================================
  // REPLY
  // ========================================

  const startReply = (message: Message) => {
    setSelectedMessage(null);

    setShowActions(false);

    setEditingMessage(null);

    setReplyingTo(message);

    setDraft("");

    setTimeout(() => inputRef.current?.focus(), 150);
  };

  // ========================================
  // REACTION
  // ========================================

  const reactToMessage = async (message: Message, emoji: string) => {
    if (!token || !conversationId || message.pending) {
      return;
    }

    setShowActions(false);

    try {
      const myReaction = findMyReaction(message);

      if (myReaction && myReaction.emoji === emoji) {
        await dispatch(
          removeReactionThunk({
            conversationId,
            messageId: message.id,
            token,
            emoji,
          }),
        ).unwrap();
      } else {
        await dispatch(
          reactToMessageThunk({
            conversationId,
            messageId: message.id,
            token,
            emoji,
          }),
        ).unwrap();
      }

      setSelectedMessage(null);
    } catch (error) {
      setSelectedMessage(null);

      Alert.alert(
        "Reaction",
        error instanceof Error ? error.message : "Unable to update reaction.",
      );
    }
  };

  // ========================================
  // PIN / UNPIN
  // ========================================

  const pinMessage = async (message: Message) => {
    if (!token || !conversationId) {
      return;
    }

    const currentlyPinned = pinnedIds.includes(message.id);

    try {
      if (currentlyPinned) {
        await dispatch(
          unpinMessageThunk({
            conversationId,
            token,
          }),
        ).unwrap();
      } else {
        await dispatch(
          pinMessageThunk({
            conversationId,
            messageId: message.id,
            token,
          }),
        ).unwrap();
      }

      // Stays in the menu (the label switches to Pin / Unpin).
      showMenuNotice(currentlyPinned ? "Unpinned" : "Pinned ✓");
    } catch (error) {
      Alert.alert(
        "Pin message",
        error instanceof Error
          ? error.message
          : "Unable to update pinned message.",
      );
    }
  };

  // ========================================
  // MESSAGE INFO (who has seen it)
  // ========================================

  const openMessageInfo = async (message: Message) => {
    if (!token || !conversationId) {
      return;
    }

    setShowActions(false);

    setSelectedMessage(null);

    setInfoMessage(message);

    try {
      setInfoLoading(true);

      await dispatch(
        fetchMessageSeen({
          conversationId,
          messageId: message.id,
          token,
        }),
      ).unwrap();
    } catch (error) {
      Alert.alert(
        "Message info",
        error instanceof Error ? error.message : "Unable to load message info.",
      );
    } finally {
      setInfoLoading(false);
    }
  };

  // ========================================
  // FORWARD
  // ========================================

  const forwardMessage = (message: Message) => {
    setShowActions(false);

    setSelectedMessage(null);

    setForwardMessages([message]);

    setUserSearch("");

    setShowForwardModal(true);
  };

  const closeForwardModal = () => {
    setShowForwardModal(false);

    setForwardMessages([]);

    setUserSearch("");
  };

  const finishForward = () => {
    closeForwardModal();

    setSelectedMessage(null);

    if (selectionMode) {
      exitSelectionMode();
    }

    Alert.alert(
      "Forwarded",
      forwardMessages.length > 1
        ? "Messages forwarded successfully."
        : "Message forwarded successfully.",
    );
  };

  const forwardToConversation = async (targetConversationId: string) => {
    if (!token || !conversationId || forwardMessages.length === 0) {
      return;
    }

    if (targetConversationId === conversationId) {
      Alert.alert(
        "Forward",
        "You cannot forward the message to the same chat.",
      );

      return;
    }

    try {
      for (const item of forwardMessages) {
        await dispatch(
          forwardMessageThunk({
            conversationId,
            messageId: item.id,
            token,
            targetConversationId,
          }),
        ).unwrap();
      }

      finishForward();
    } catch (error) {
      Alert.alert(
        "Forward",
        error instanceof Error ? error.message : "Unable to forward message.",
      );
    }
  };

  const forwardToUser = async (username: string) => {
    if (!token || !conversationId || forwardMessages.length === 0) {
      return;
    }

    const cleanUsername = username.trim().replace(/^@/, "");

    if (!cleanUsername) {
      return;
    }

    try {
      for (const item of forwardMessages) {
        await dispatch(
          forwardMessageThunk({
            conversationId,
            messageId: item.id,
            token,
            targetUsername: cleanUsername,
          }),
        ).unwrap();
      }

      finishForward();
    } catch (error) {
      Alert.alert(
        "Forward",
        error instanceof Error ? error.message : "Unable to forward message.",
      );
    }
  };

  // ========================================
  // SELECT
  // ========================================

  const selectedMessages = useMemo(
    () =>
      messages.filter((message) => selectedIds.includes(message.id)).reverse(),
    [messages, selectedIds],
  );

  const exitSelectionMode = () => {
    setSelectionMode(false);

    dispatch(clearSelectedMessages(conversationId));
  };

  const toggleMessageSelection = (message: Message) => {
    if (message.pending) {
      return;
    }

    // Deselecting the last selected message leaves selection mode.
    if (selectedIds.includes(message.id) && selectedIds.length === 1) {
      exitSelectionMode();

      return;
    }

    dispatch(
      toggleSelectedMessage({
        conversationId,
        messageId: message.id,
      }),
    );
  };

  const selectMessage = (message: Message) => {
    setShowActions(false);

    setSelectedMessage(null);

    setSelectionMode(true);

    dispatch(
      toggleSelectedMessage({
        conversationId,
        messageId: message.id,
      }),
    );
  };

  const forwardSelected = () => {
    if (selectedMessages.length === 0) {
      return;
    }

    setForwardMessages(selectedMessages);

    setUserSearch("");

    setShowForwardModal(true);
  };

  const copySelected = async () => {
    const text = selectedMessages
      .map((message) => message.content?.trim())
      .filter(Boolean)
      .join("\n");

    if (!text) {
      Alert.alert("Copy", "There is no text to copy.");

      return;
    }

    try {
      await Clipboard.setStringAsync(text);

      exitSelectionMode();
    } catch {
      Alert.alert("Copy", "Unable to copy the messages.");
    }
  };

  const replyToSelected = () => {
    if (selectedMessages.length !== 1) {
      return;
    }

    const target = selectedMessages[0];

    exitSelectionMode();

    startReply(target);
  };

  const deleteSelectedFor = async (scope: "me" | "everyone") => {
    if (!token || !conversationId) {
      return;
    }

    const targets = selectedMessages;

    // Hide them all immediately and leave selection mode right away —
    // previously this waited for every delete to round-trip one at a
    // time (sequential awaits in a loop) before anything visibly
    // happened, which is the main reason bulk delete felt slow.
    setLocallyDeletedIds((current) => {
      const next = new Set(current);
      for (const message of targets) {
        next.add(message.id);
      }
      return next;
    });

    exitSelectionMode();

    const results = await Promise.allSettled(
      targets.map((message) =>
        dispatch(
          removeMessage({
            conversationId,
            messageId: message.id,
            token,
            scope,
          }),
        ).unwrap(),
      ),
    );

    const failedIds = targets
      .filter((_, index) => results[index].status === "rejected")
      .map((message) => message.id);

    if (failedIds.length > 0) {
      // Roll back only the ones that actually failed.
      setLocallyDeletedIds((current) => {
        const next = new Set(current);
        for (const id of failedIds) {
          next.delete(id);
        }
        return next;
      });

      Alert.alert(
        "Delete message",
        failedIds.length === targets.length
          ? "Unable to delete these messages."
          : `${failedIds.length} message${
              failedIds.length === 1 ? "" : "s"
            } could not be deleted.`,
      );
    }
  };

  const deleteSelected = () => {
    if (selectedMessages.length === 0 || !token || !conversationId) {
      return;
    }

    setDeleteSheet({ messages: selectedMessages, single: false });
  };

  // ========================================
  // ATTACHMENTS
  // ========================================

  const openAttachmentPreview = ({
    uri,
    name,
    type,
    kind,
  }: AttachmentDraft) => {
    // The attachment sheet is already closed by attachmentMessage, so only
    // the preview modal changes here.
    setAttachmentDraft({ uri, name, type, kind });
    setAttachmentCaption("");
  };

  // WhatsApp-style: the preview closes the moment Send is tapped, the
  // photo/video appears in the chat straight away with a spinner on it,
  // and it uploads in the background. (Before, the preview stayed open
  // with a spinner until the whole upload had finished.)
  const sendAttachment = async () => {
    if (!attachmentDraft || !token || !conversationId) {
      return;
    }

    // Keep what we're sending, then close the preview right away.
    const draftToSend = attachmentDraft;
    const caption = attachmentCaption.trim();

    setAttachmentDraft(null);
    setAttachmentCaption("");

    const pendingId = addPendingMessage({
      sender: {
        id: currentUserId,
        username: currentUsername,
      },
      kind: draftToSend.kind,
      content: caption,
      createdAt: new Date().toISOString(),
      media: {
        uri: draftToSend.uri,
        name: draftToSend.name,
        type: draftToSend.type,
      },
    });

    scrollToLatestIfNeeded();

    try {
      await dispatch(
        createMessage({
          conversationId,
          token,
          data: {
            kind: draftToSend.kind,
            content: caption || undefined,
            file: {
              uri: draftToSend.uri,
              name: draftToSend.name,
              type: draftToSend.type,
            },
          },
        }),
      ).unwrap();
    } catch (error) {
      console.error("ATTACHMENT SEND ERROR:", error);

      Alert.alert(
        "Attachment",
        typeof error === "string" && error
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to send this attachment.",
      );
    } finally {
      // On success the real message is already in the list (and hides
      // this pending copy); on failure this removes the failed one.
      removePendingMessage(pendingId);
    }
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Photo permission",
        "Please allow CosQuest to access your photos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      // Was quality: 1 (full-resolution, often 3-8MB). Compressing here is
      // the single biggest lever on "why is sending a photo slow" — it cuts
      // the upload payload dramatically with barely any visible quality
      // loss on a phone screen.
      quality: IMAGE_PICKER_QUALITY,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    openAttachmentPreview({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
      kind: "image",
    });
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Video permission",
        "Please allow CosQuest to access your photos and videos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      // Note: expo-image-picker doesn't transcode/compress video the way it
      // does photos. If large videos are still slow to send after the photo
      // fix, the next step is running them through expo-video-thumbnails /
      // a transcoding step (e.g. ffmpeg-kit) before upload, or capping
      // videoMaxDuration for recorded clips.
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    openAttachmentPreview({
      uri: asset.uri,
      name: asset.fileName || `video-${Date.now()}.mp4`,
      type: asset.mimeType || "video/mp4",
      kind: "video",
    });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Camera permission",
        "Please allow CosQuest to use your camera.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      // Same compression note as pickPhoto above.
      quality: IMAGE_PICKER_QUALITY,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    openAttachmentPreview({
      uri: asset.uri,
      name: asset.fileName || `camera-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
      kind: "image",
    });
  };

  const attachmentMessage = async (type: string) => {
    // Close the sheet FIRST and let its animation finish before opening a
    // picker or another modal. Opening one while this modal is still
    // closing leaves an invisible modal on screen that blocks every touch.
    setShowAttachments(false);

    await new Promise((resolve) => setTimeout(resolve, 450));

    try {
      if (type === "Photo") return await pickPhoto();
      if (type === "Video") return await pickVideo();
      if (type === "Camera") return await takePhoto();

      if (type === "Audio") {
        Alert.alert(
          "Voice message",
          "Press and hold the microphone button, then release it to send.",
        );
      }
    } catch (error) {
      console.error("ATTACHMENT PICKER ERROR:", error);
      Alert.alert(
        "Attachment",
        error instanceof Error
          ? error.message
          : "Unable to open the attachment picker.",
      );
    }
  };

  // ========================================
  // CALLS
  // ========================================
  // DM only. Starts the call on the backend, then opens the call screen
  // (app/call/[id].tsx). The other person's phone rings through the
  // call:incoming socket event.

  const beginCall = async (type: "audio" | "video") => {
    if (!token || !conversationId || callStarting) {
      return;
    }

    const allowed = await ensureCallPermissions(type);

    if (!allowed) {
      return;
    }

    try {
      const result = await dispatch(
        startCall({ conversationId, type, token }),
      ).unwrap();

      // The call opens full screen by itself (ActiveCallOverlay in the
      // app layout) and keeps going if you minimize it to chat.
      void result;
    } catch (error) {
      // Thunks reject with a plain string, not an Error.
      Alert.alert(
        type === "video" ? "Video call" : "Audio call",
        typeof error === "string" ? error : "Unable to start the call.",
      );
    }
  };

  const startAudioCall = () => beginCall("audio");

  const startVideoCall = () => beginCall("video");

  // Tapping a call entry calls back. Kept stable (same function every
  // render) so the memoised message bubbles don't all re-render.
  const beginCallRef = useRef(beginCall);
  beginCallRef.current = beginCall;

  const handleCallBack = useCallback((type: "audio" | "video") => {
    beginCallRef.current(type);
  }, []);

  // ========================================
  // MESSAGE PRESS / LONG PRESS
  // ========================================

  const handleMessagePress = (message: Message) => {
    if (selectionMode) {
      toggleMessageSelection(message);
    }
  };

  const openMessageActions = (message: Message) => {
    if (message.pending) {
      return;
    }

    if (selectionMode) {
      toggleMessageSelection(message);

      return;
    }

    if (message.deleted) {
      return;
    }

    menuOpenedAtRef.current = Date.now();
    setMenuNotice("");
    setSelectedMessage(message);

    setShowActions(true);
  };

  const closeMenu = () => {
    setShowActions(false);
    setSelectedMessage(null);
  };

  // Wraps a menu action: ignored right after the menu opens (the finger
  // that long-pressed is still lifting off).
  const menuTap = (action: () => void) => () => {
    if (Date.now() - menuOpenedAtRef.current < MENU_TAP_GUARD_MS) {
      return;
    }

    action();
  };

  const showMenuNotice = (text: string) => {
    setMenuNotice(text);
    setTimeout(() => setMenuNotice(""), 1600);
  };

  const handleMediaPress = (message: Message) => {
    if (selectionMode) {
      toggleMessageSelection(message);

      return;
    }

    setMediaViewer(message);
  };

  // ========================================
  // SCROLL
  // ========================================

  // Mirrors the FlatList's live scroll offset. Used so we only force a
  // scroll-to-bottom after sending when the user has actually scrolled
  // away — calling scrollToOffset({offset: 0}) while already at 0 doesn't
  // move anything, but iOS still plays a small overscroll "bounce"
  // animation, which is what read as the message jumping up then
  // dropping back down right after sending.
  const scrollOffsetRef = useRef(0);

  const NEAR_BOTTOM_THRESHOLD = 40;

  const handleScroll = (event: any) => {
    const offset = event.nativeEvent.contentOffset.y || 0;

    scrollOffsetRef.current = offset;

    const shouldShow = offset > 180;

    setShowJumpButton(shouldShow);

    if (!shouldShow) {
      setNewMessageCount(0);
    }
  };

  // Call after a message/attachment/voice note is sent. Only actually
  // scrolls if you'd scrolled up away from the latest message.
  const scrollToLatestIfNeeded = () => {
    if (scrollOffsetRef.current > NEAR_BOTTOM_THRESHOLD) {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    }

    setShowJumpButton(false);

    setNewMessageCount(0);
  };

  const jumpToLatest = () => {
    listRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });

    setShowJumpButton(false);

    setNewMessageCount(0);
  };

  // ========================================
  // NO TOKEN
  // ========================================

  if (!token) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Please log in again.</Text>
      </View>
    );
  }

  const recording = recorderState.isRecording;

  const showSendButton = !!editingMessage || !!draft.trim();

  const forwardPreviewText =
    forwardMessages.length > 1
      ? `${forwardMessages.length} messages`
      : forwardMessages[0]?.content ||
        (forwardMessages[0] ? getMessageTypeLabel(forwardMessages[0]) : "") ||
        "Message";

  const selectedMessageIsMine =
    !!selectedMessage && isMyMessage(selectedMessage);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // Was insets.top: that's meant to offset content sitting ABOVE this
      // view outside of it, not the safe-area inside it — since the header
      // lives inside this same KeyboardAvoidingView, adding insets.top here
      // double-counted space and contributed to the oversized keyboard gap.
      keyboardVerticalOffset={0}>
      {/* Chat wallpaper behind everything */}
      <ChatWallpaperBackground
        key={
          shownWallpaper.kind === "photo"
            ? shownWallpaper.uri.slice(0, 80)
            : shownWallpaper.id
        }
        wallpaper={shownWallpaper}
      />

      {/* ================================== */}
      {/* HEADER */}
      {/* ================================== */}

      <View
        style={[
          styles.headerContainer,
          {
            paddingTop: insets.top + 6,
          },
        ]}>
        <View style={styles.header}>
          {selectionMode ? (
            <>
              <Pressable onPress={exitSelectionMode} hitSlop={10}>
                <Ionicons name="close" size={27} color="#191922" />
              </Pressable>

              <Text style={styles.selectionTitle}>{selectedIds.length}</Text>

              <View style={styles.selectionActions}>
                {selectedIds.length === 1 ? (
                  <Pressable onPress={replyToSelected} hitSlop={8}>
                    <Ionicons
                      name="arrow-undo-outline"
                      size={23}
                      color="#C5399A"
                    />
                  </Pressable>
                ) : null}

                <Pressable onPress={copySelected} hitSlop={8}>
                  <Ionicons name="copy-outline" size={22} color="#C5399A" />
                </Pressable>

                <Pressable onPress={forwardSelected} hitSlop={8}>
                  <Ionicons
                    name="arrow-redo-outline"
                    size={23}
                    color="#C5399A"
                  />
                </Pressable>

                <Pressable onPress={deleteSelected} hitSlop={8}>
                  <Ionicons name="trash-outline" size={23} color="#D64545" />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                style={styles.backButton}>
                <Ionicons name="chevron-back" size={27} color="#191922" />
              </Pressable>

              {/* Tap their photo or name to see their profile (DMs) */}
              <Pressable
                style={styles.headerProfileTap}
                onPress={openTheirProfile}
                disabled={!otherUsername}
                accessibilityRole="button"
                accessibilityLabel="View profile">
                <View style={styles.headerAvatarWrap}>
                  <View style={styles.headerAvatar}>
                    {headerAvatar ? (
                      <ExpoImage
                        source={{
                          uri: headerAvatar,
                        }}
                        style={styles.headerAvatarImage}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <Ionicons
                        name={groupChat ? "people-outline" : "person"}
                        size={20}
                        color="#C5399A"
                      />
                    )}
                  </View>

                  {/* Green dot while they're online (DMs only) */}
                  {conversation?.type === "dm" &&
                  conversation.otherParticipant?.isOnline ? (
                    <View style={styles.headerOnlineDot} />
                  ) : null}
                </View>

                <View style={styles.headerText}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {headerName}
                  </Text>

                  <Text style={styles.headerStatus} numberOfLines={1}>
                    {headerStatus}
                  </Text>
                </View>
              </Pressable>

              {canCall ? (
                <>
                  <Pressable
                    hitSlop={10}
                    onPress={startVideoCall}
                    disabled={callStarting}
                    accessibilityRole="button"
                    accessibilityLabel="Start video call">
                    <Ionicons name="videocam" size={24} color="#C5399A" />
                  </Pressable>

                  <Pressable
                    hitSlop={10}
                    style={{
                      marginLeft: 20,
                    }}
                    onPress={startAudioCall}
                    disabled={callStarting}
                    accessibilityRole="button"
                    accessibilityLabel="Start voice call">
                    <Ionicons name="call" size={21} color="#C5399A" />
                  </Pressable>
                </>
              ) : null}

              {/* ⋮ → Wallpaper */}
              <Pressable
                hitSlop={10}
                style={{ marginLeft: 16 }}
                onPress={() => setShowChatMenu(true)}
                accessibilityRole="button"
                accessibilityLabel="Chat options">
                <Ionicons name="ellipsis-vertical" size={20} color="#4B4B53" />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* ================================== */}
      {/* PINNED BANNER */}
      {/* ================================== */}

      {pinnedMessageId && !selectionMode ? (
        <Pressable
          style={styles.pinnedBanner}
          onPress={() => scrollToMessage(pinnedMessageId)}>
          <Ionicons name="pin" size={16} color="#C5399A" />

          <View style={styles.pinnedBannerText}>
            <Text style={styles.pinnedBannerTitle}>Pinned message</Text>

            <Text numberOfLines={1} style={styles.pinnedBannerBody}>
              {pinnedMessage
                ? pinnedMessage.deleted
                  ? "This message was deleted."
                  : pinnedMessage.content ||
                    getMessageTypeLabel(pinnedMessage) ||
                    "Message"
                : "Tap to view"}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* ================================== */}
      {/* MESSAGES */}
      {/* ================================== */}

      {messagesLoading && messages.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#C5399A" />

          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <View style={styles.messageListWrapper}>
          <FlatList
            ref={listRef}
            data={visibleMessages}
            inverted
            keyExtractor={(item) => item.id}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            extraData={listExtraData}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });

              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 350);
            }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>
                  No messages yet. Say hi 👋
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const mine = isMyMessage(item);

              // Inverted list: index + 1 is the OLDER message, index - 1 the NEWER one.
              const older = visibleMessages[index + 1];

              const newer = visibleMessages[index - 1];

              const showDate =
                !older ||
                getDateKey(older.createdAt) !== getDateKey(item.createdAt);

              const firstInGroup =
                showDate ||
                !older ||
                getSenderKey(older) !== getSenderKey(item);

              const lastInGroup =
                !newer ||
                getDateKey(newer.createdAt) !== getDateKey(item.createdAt) ||
                getSenderKey(newer) !== getSenderKey(item);

              const selected =
                selectedIds.includes(item.id) || highlightedId === item.id;

              const pinned = pinnedIds.includes(item.id);

              return (
                <View>
                  {showDate ? <DateSeparator message={item} /> : null}

                  <SwipeToReply
                    enabled={
                      !selectionMode &&
                      !item.pending &&
                      !item.deleted &&
                      item.kind !== "call"
                    }
                    onReply={() => startReply(item)}>
                    <Bubble
                      msg={item}
                      mine={mine}
                      groupChat={!!groupChat}
                      firstInGroup={firstInGroup}
                      lastInGroup={lastInGroup}
                      selected={selected}
                      pinned={pinned}
                      myReactionEmoji={findMyReaction(item)?.emoji}
                      onPress={handleMessagePress}
                      onLongPress={openMessageActions}
                      onReaction={(message, emoji) => {
                        if (selectionMode) {
                          toggleMessageSelection(message);

                          return;
                        }

                        reactToMessage(message, emoji);
                      }}
                      onMediaPress={handleMediaPress}
                      onReplyPress={scrollToMessage}
                      onCallBack={handleCallBack}
                      otherParticipant={conversation?.otherParticipant}
                    />
                  </SwipeToReply>
                </View>
              );
            }}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* ================================== */}
      {/* JUMP TO LATEST */}
      {/* ================================== */}

      {showJumpButton && !selectionMode ? (
        <Pressable style={styles.jumpButton} onPress={jumpToLatest}>
          <Ionicons name="chevron-down" size={24} color="#C5399A" />

          {newMessageCount > 0 ? (
            <View style={styles.newMessageBadge}>
              <Text style={styles.newMessageBadgeText}>
                {newMessageCount > 99 ? "99+" : newMessageCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {/* ================================== */}
      {/* VOICE HINT */}
      {/* ================================== */}

      {voiceHint ? (
        <View style={styles.voiceHint}>
          <Text style={styles.voiceHintText}>{voiceHint}</Text>
        </View>
      ) : null}

      {/* ================================== */}
      {/* EDIT / REPLY */}
      {/* ================================== */}

      {editingMessage ? (
        <View style={styles.editingBar}>
          <View style={styles.editingCard}>
            <View style={styles.editingAccent} />

            <View style={styles.editingContent}>
              <Text style={styles.editingTitle}>Edit message</Text>

              <Text numberOfLines={1} style={styles.editingText}>
                {editingMessage.content}
              </Text>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => {
                setEditingMessage(null);
                setDraft("");
              }}>
              <Ionicons name="close-circle" size={23} color="#8A8A90" />
            </Pressable>
          </View>
        </View>
      ) : replyingTo ? (
        <View style={styles.editingBar}>
          <View style={styles.editingCard}>
            <View style={styles.editingAccent} />

            <View style={styles.editingContent}>
              <Text style={styles.editingTitle}>
                {isMyMessage(replyingTo)
                  ? "You"
                  : replyingTo.sender?.username || "User"}
              </Text>

              <Text numberOfLines={1} style={styles.editingText}>
                {replyingTo.content ||
                  getMessageTypeLabel(replyingTo) ||
                  "Message"}
              </Text>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => {
                setReplyingTo(null);
                setDraft("");
              }}>
              <Ionicons name="close-circle" size={23} color="#8A8A90" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* ================================== */}
      {/* COMPOSER */}
      {/* ================================== */}

      {/* Blocked: no message box, an Unblock button instead */}
      {!selectionMode && iBlockedThem ? (
        <View
          style={[
            styles.blockedBar,
            { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 12 },
          ]}>
          <Text style={styles.blockedText}>
            You blocked @{otherUsername}. Unblock to send messages.
          </Text>

          <Pressable
            style={styles.blockedButton}
            onPress={doUnblock}
            disabled={blockBusy}>
            {blockBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.blockedButtonText}>Unblock</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {!selectionMode && !iBlockedThem ? (
        <View
          style={[
            styles.composer,
            {
              // While the keyboard is open, the keyboard itself sits at the
              // bottom of the screen — insets.bottom (the home-indicator
              // safe area) no longer applies and was being stacked on top
              // of the keyboard, producing a large gap. Only add it back
              // once the keyboard is dismissed.
              paddingBottom: keyboardVisible ? 8 : insets.bottom + 8,
            },
          ]}>
          <View style={styles.inputPill}>
            {recording ? (
              <RecordingIndicator
                durationMillis={recorderState.durationMillis}
                metering={recorderState.metering}
                cancelArmed={cancelArmed}
              />
            ) : (
              <>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={draft}
                  onChangeText={handleDraftChange}
                  placeholder={editingMessage ? "Edit message" : "Message"}
                  placeholderTextColor="#9C9CAA"
                  multiline
                  // Browsers make a multi-line box 2 rows tall by default,
                  // which made the input look too tall on the website.
                  numberOfLines={Platform.OS === "web" ? 1 : undefined}
                  maxLength={2000}
                />

                {!editingMessage ? (
                  <Pressable
                    hitSlop={6}
                    style={styles.pillIcon}
                    onPress={() => setShowAttachments(true)}>
                    <Ionicons name="attach" size={24} color="#8A8A90" />
                  </Pressable>
                ) : null}

                {!editingMessage && !draft.trim() ? (
                  <Pressable
                    hitSlop={6}
                    style={styles.pillIcon}
                    onPress={takePhoto}>
                    <Ionicons name="camera-outline" size={23} color="#8A8A90" />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          {showSendButton ? (
            <Pressable
              style={styles.circleButton}
              onPress={editingMessage ? saveEdit : send}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel={
                editingMessage ? "Save edit" : "Send message"
              }>
              <Ionicons
                name={editingMessage ? "checkmark" : "send"}
                size={editingMessage ? 24 : 20}
                color="#FFFFFF"
              />
            </Pressable>
          ) : (
            <View
              style={[styles.circleButton, recording && styles.circleRecording]}
              accessibilityRole="button"
              accessibilityLabel="Hold to record voice message"
              {...micPanResponder.panHandlers}>
              <Ionicons name="mic" size={23} color="#FFFFFF" />
            </View>
          )}
        </View>
      ) : null}

      {/* ================================== */}
      {/* MEDIA VIEWER */}
      {/* ================================== */}

      <Modal
        visible={!!mediaViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setMediaViewer(null)}>
        <View style={styles.mediaViewerBackdrop}>
          <Pressable
            style={styles.mediaViewerClose}
            onPress={() => setMediaViewer(null)}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>

          {mediaViewer?.kind === "image" && getMediaUrl(mediaViewer.media) ? (
            <ExpoImage
              source={{ uri: getMediaUrl(mediaViewer.media)! }}
              style={styles.fullscreenImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}

          {mediaViewer?.kind === "video" && getMediaUrl(mediaViewer.media) ? (
            <VideoViewer uri={getMediaUrl(mediaViewer.media)!} />
          ) : null}
        </View>
      </Modal>

      {/* ================================== */}
      {/* ATTACHMENT PREVIEW */}
      {/* ================================== */}

      <Modal
        visible={!!attachmentDraft}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!attachmentSending) {
            setAttachmentDraft(null);
            setAttachmentCaption("");
          }
        }}>
        <View style={styles.attachmentPreviewScreen}>
          <View style={styles.attachmentPreviewHeader}>
            <Pressable
              onPress={() => {
                if (!attachmentSending) {
                  setAttachmentDraft(null);
                  setAttachmentCaption("");
                }
              }}
              disabled={attachmentSending}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>

            <Text style={styles.attachmentPreviewTitle}>Preview</Text>

            <View style={{ width: 28 }} />
          </View>

          <View style={styles.attachmentPreviewContent}>
            {attachmentDraft?.kind === "image" ? (
              <Image
                source={{ uri: attachmentDraft.uri }}
                style={styles.attachmentPreviewImage}
                resizeMode="contain"
              />
            ) : null}

            {attachmentDraft?.kind === "video" ? (
              <VideoViewer uri={attachmentDraft.uri} />
            ) : null}

            {attachmentDraft?.kind === "document" ? (
              <View style={styles.documentPreviewCard}>
                <View style={styles.documentPreviewIcon}>
                  <Ionicons name="document-text" size={48} color="#C5399A" />
                </View>
                <Text style={styles.documentPreviewName} numberOfLines={3}>
                  {attachmentDraft.name}
                </Text>
                <Text style={styles.documentPreviewHint}>Ready to send</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.attachmentPreviewComposer}>
            <TextInput
              value={attachmentCaption}
              onChangeText={setAttachmentCaption}
              placeholder="Add a caption..."
              placeholderTextColor="#A7A7B0"
              multiline
              maxLength={2000}
              style={styles.attachmentCaptionInput}
              editable={!attachmentSending}
            />

            <Pressable
              style={styles.attachmentSendButton}
              onPress={sendAttachment}
              disabled={attachmentSending}>
              {attachmentSending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={22} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ================================== */}
      {/* LONG-PRESS MENU (reactions + actions) */}
      {/* ================================== */}

      <Modal
        visible={showActions && !!selectedMessage}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}>
        <Pressable style={styles.menuBackdrop} onPress={menuTap(closeMenu)}>
          <Pressable
            style={styles.menuColumn}
            onPress={(event) => event.stopPropagation()}>
            {/* QUICK REACTIONS */}
            <View style={styles.quickReactions}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={[
                    styles.quickReaction,
                    selectedMessage &&
                      findMyReaction(selectedMessage)?.emoji === emoji &&
                      styles.quickReactionActive,
                  ]}
                  onPress={menuTap(() => {
                    if (selectedMessage) {
                      reactToMessage(selectedMessage, emoji);
                    }
                  })}>
                  <Text style={styles.quickReactionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* ACTIONS */}
            <View style={styles.menuCard}>
              {selectedMessage ? (
                <View style={styles.menuPreview}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.menuPreviewText,
                      menuNotice ? styles.menuNoticeText : null,
                    ]}>
                    {menuNotice ||
                      selectedMessage.content ||
                      getMessageTypeLabel(selectedMessage) ||
                      "Message"}
                  </Text>

                  {/* ✕ back to the chat */}
                  <Pressable
                    onPress={closeMenu}
                    hitSlop={10}
                    style={styles.menuClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close menu">
                    <Ionicons name="close" size={18} color="#55555E" />
                  </Pressable>
                </View>
              ) : null}

              <MenuItem
                icon="arrow-undo-outline"
                label="Reply"
                onPress={menuTap(
                  () => selectedMessage && startReply(selectedMessage),
                )}
              />

              {selectedMessage?.content?.trim() ? (
                <MenuItem
                  icon="copy-outline"
                  label="Copy"
                  onPress={menuTap(
                    () => selectedMessage && copyMessage(selectedMessage),
                  )}
                />
              ) : null}

              <MenuItem
                icon="arrow-redo-outline"
                label="Forward"
                onPress={menuTap(
                  () => selectedMessage && forwardMessage(selectedMessage),
                )}
              />

              <MenuItem
                icon={
                  selectedMessage && pinnedIds.includes(selectedMessage.id)
                    ? "pin"
                    : "pin-outline"
                }
                label={
                  selectedMessage && pinnedIds.includes(selectedMessage.id)
                    ? "Unpin"
                    : "Pin"
                }
                onPress={menuTap(
                  () => selectedMessage && pinMessage(selectedMessage),
                )}
              />

              {selectedMessageIsMine && selectedMessage?.kind === "text" ? (
                <MenuItem
                  icon="create-outline"
                  label="Edit"
                  onPress={menuTap(
                    () => selectedMessage && startEditing(selectedMessage),
                  )}
                />
              ) : null}

              {selectedMessageIsMine ? (
                <MenuItem
                  icon="information-circle-outline"
                  label="Info"
                  onPress={menuTap(
                    () => selectedMessage && openMessageInfo(selectedMessage),
                  )}
                />
              ) : null}

              <MenuItem
                icon="link-outline"
                label="Copy link"
                onPress={menuTap(
                  () => selectedMessage && copyMessageLink(selectedMessage),
                )}
              />

              <MenuItem
                icon="checkmark-circle-outline"
                label="Select"
                onPress={menuTap(
                  () => selectedMessage && selectMessage(selectedMessage),
                )}
              />

              <MenuItem
                icon="trash-outline"
                label="Delete"
                danger
                onPress={menuTap(
                  () => selectedMessage && deletePrompt(selectedMessage),
                )}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================== */}
      {/* DELETE SHEET */}
      {/* ================================== */}

      <Modal
        visible={!!deleteSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setDeleteSheet(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDeleteSheet(null)}>
          <Pressable
            style={styles.actionSheet}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            {deleteSheet
              ? (() => {
                  const items = deleteSheet.messages;
                  const count = items.length;
                  const allMine = items.every((item) => isMyMessage(item));
                  const recent = items.every(
                    (item) =>
                      Date.now() - new Date(item.createdAt || 0).getTime() <
                      DELETE_FOR_EVERYONE_WINDOW_MS,
                  );
                  const canEveryone = allMine && recent;

                  const closeSheet = () => setDeleteSheet(null);

                  const forEveryone = () => {
                    closeSheet();

                    if (deleteSheet.single) {
                      deleteForEveryone(items[0]);
                    } else {
                      deleteSelectedFor("everyone");
                    }
                  };

                  const forMe = () => {
                    closeSheet();

                    if (deleteSheet.single) {
                      deleteForMe(items[0]);
                    } else {
                      deleteSelectedFor("me");
                    }
                  };

                  return (
                    <>
                      <Text style={styles.actionTitle}>
                        {count === 1
                          ? "Delete message?"
                          : `Delete ${count} messages?`}
                      </Text>

                      <Text style={styles.deleteHint}>
                        {canEveryone
                          ? "Delete for everyone removes it for both of you."
                          : allMine
                            ? "Delete for everyone is only possible within 5 minutes of sending. You can still delete it for yourself."
                            : "This removes it from your chat only."}
                      </Text>

                      {canEveryone ? (
                        <Pressable
                          style={styles.deleteOption}
                          onPress={forEveryone}>
                          <Ionicons
                            name="trash-outline"
                            size={20}
                            color="#D64545"
                          />
                          <Text style={styles.deleteOptionText}>
                            Delete for everyone
                          </Text>
                        </Pressable>
                      ) : null}

                      <Pressable style={styles.deleteOption} onPress={forMe}>
                        <Ionicons
                          name="trash-bin-outline"
                          size={20}
                          color="#D64545"
                        />
                        <Text style={styles.deleteOptionText}>
                          Delete for me
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.cancelButton}
                        onPress={closeSheet}>
                        <Text style={styles.cancelText}>Cancel</Text>
                      </Pressable>
                    </>
                  );
                })()
              : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================== */}
      {/* MESSAGE INFO */}
      {/* ================================== */}

      <Modal
        visible={!!infoMessage}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoMessage(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setInfoMessage(null)}>
          <Pressable
            style={styles.actionSheet}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <Text style={styles.actionTitle}>Message info</Text>

            {infoMessage ? (
              <View style={styles.forwardPreview}>
                <Ionicons name="chatbubble-outline" size={18} color="#C5399A" />

                <Text numberOfLines={2} style={styles.forwardPreviewText}>
                  {infoMessage.content ||
                    getMessageTypeLabel(infoMessage) ||
                    "Message"}
                </Text>
              </View>
            ) : null}

            <Text style={styles.forwardSectionTitle}>Seen by</Text>

            <ScrollView style={styles.sheetScroll}>
              {infoLoading && !seenBy ? (
                <View style={styles.forwardLoading}>
                  <ActivityIndicator size="small" color="#C5399A" />
                </View>
              ) : !seenBy || seenBy.length === 0 ? (
                <Text style={styles.noUsersText}>
                  No one has seen this message yet.
                </Text>
              ) : (
                seenBy.map((person, index) => (
                  <View
                    key={person.id || `${person.username}-${index}`}
                    style={styles.actionButton}>
                    <View style={styles.forwardUserAvatar}>
                      {person.avatarPhotoUrl ? (
                        <ExpoImage
                          source={{
                            uri: person.avatarPhotoUrl,
                          }}
                          style={styles.forwardUserAvatarImage}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <Ionicons name="person" size={18} color="#C5399A" />
                      )}
                    </View>

                    <View style={styles.forwardUserInfo}>
                      <Text style={styles.actionText} numberOfLines={1}>
                        {person.name || person.username || "User"}
                      </Text>

                      {person.seenAt ? (
                        <Text style={styles.forwardUsername}>
                          {getDateLabel(person.seenAt) === "TODAY"
                            ? `Today, ${formatMessageTime(person.seenAt)}`
                            : `${getDateLabel(person.seenAt)}, ${formatMessageTime(
                                person.seenAt,
                              )}`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setInfoMessage(null)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================== */}
      {/* FORWARD MODAL */}
      {/* ================================== */}

      <Modal
        visible={showForwardModal}
        transparent
        animationType="slide"
        onRequestClose={closeForwardModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeForwardModal}>
          <Pressable
            style={styles.actionSheet}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <Text style={styles.actionTitle}>Forward to...</Text>

            {forwardMessages.length > 0 ? (
              <View style={styles.forwardPreview}>
                <Ionicons name="arrow-redo-outline" size={18} color="#C5399A" />

                <Text numberOfLines={2} style={styles.forwardPreviewText}>
                  {forwardPreviewText}
                </Text>
              </View>
            ) : null}

            <TextInput
              value={userSearch}
              onChangeText={setUserSearch}
              placeholder="Search people..."
              placeholderTextColor="#9C9CAA"
              style={styles.forwardSearchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ScrollView
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.forwardSectionTitle}>Your chats</Text>

              {conversations
                .filter((chat) => chat.id !== conversationId)
                .map((chat) => {
                  const name =
                    chat.type === "dm"
                      ? chat.title || chat.otherParticipant?.username || "User"
                      : chat.title ||
                        (chat.type === "faction" ? "Faction" : "Community");

                  return (
                    <Pressable
                      key={chat.id}
                      style={styles.actionButton}
                      onPress={() => forwardToConversation(chat.id)}>
                      <View style={styles.forwardChatIcon}>
                        <Ionicons
                          name={
                            chat.type === "dm"
                              ? "person-outline"
                              : "people-outline"
                          }
                          size={20}
                          color="#C5399A"
                        />
                      </View>

                      <Text style={styles.actionText} numberOfLines={1}>
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}

              {userSearch.trim() ? (
                <>
                  <Text style={styles.forwardSectionTitle}>People</Text>

                  {usersLoading ? (
                    <View style={styles.forwardLoading}>
                      <ActivityIndicator size="small" color="#C5399A" />
                    </View>
                  ) : searchedUsers.length === 0 ? (
                    <Text style={styles.noUsersText}>No people found.</Text>
                  ) : (
                    searchedUsers.map((person) => (
                      <Pressable
                        key={person.id}
                        style={styles.actionButton}
                        onPress={() => forwardToUser(person.username || "")}>
                        <View style={styles.forwardUserAvatar}>
                          {person.avatarPhotoUrl ? (
                            <ExpoImage
                              source={{
                                uri: person.avatarPhotoUrl,
                              }}
                              style={styles.forwardUserAvatarImage}
                              cachePolicy="memory-disk"
                            />
                          ) : (
                            <Ionicons name="person" size={18} color="#C5399A" />
                          )}
                        </View>

                        <View style={styles.forwardUserInfo}>
                          <Text style={styles.actionText} numberOfLines={1}>
                            {person.name || person.username || "User"}
                          </Text>

                          {person.username ? (
                            <Text style={styles.forwardUsername}>
                              @{person.username}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))
                  )}
                </>
              ) : null}
            </ScrollView>

            <Pressable style={styles.cancelButton} onPress={closeForwardModal}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ================================== */}
      {/* ATTACHMENT MODAL */}
      {/* ================================== */}

      <Modal
        visible={showAttachments}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachments(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowAttachments(false)}>
          <View style={styles.attachmentSheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.attachmentGrid}>
              <AttachmentButton
                icon="camera-outline"
                label="Camera"
                onPress={() => attachmentMessage("Camera")}
              />

              <AttachmentButton
                icon="images-outline"
                label="Photo"
                onPress={() => attachmentMessage("Photo")}
              />

              <AttachmentButton
                icon="videocam-outline"
                label="Video"
                onPress={() => attachmentMessage("Video")}
              />

              <AttachmentButton
                icon="mic-outline"
                label="Audio"
                onPress={() => attachmentMessage("Audio")}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
      {/* ⋮ CHAT MENU */}
      <Modal
        visible={showChatMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChatMenu(false)}>
        <Pressable
          style={styles.chatMenuBackdrop}
          onPress={() => setShowChatMenu(false)}>
          <View style={[styles.chatMenu, { top: insets.top + 52 }]}>
            {otherUsername ? (
              <Pressable style={styles.chatMenuItem} onPress={openTheirProfile}>
                <Ionicons
                  name="person-circle-outline"
                  size={20}
                  color="#191922"
                />
                <Text style={styles.chatMenuText}>View profile</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.chatMenuItem}
              onPress={() => {
                setShowChatMenu(false);
                setShowWallpaperPicker(true);
              }}>
              <Ionicons name="image-outline" size={20} color="#191922" />
              <Text style={styles.chatMenuText}>Wallpaper</Text>
            </Pressable>

            {otherUsername ? (
              iBlockedThem ? (
                <Pressable style={styles.chatMenuItem} onPress={doUnblock}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color="#191922"
                  />
                  <Text style={styles.chatMenuText}>Unblock</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.chatMenuItem} onPress={confirmBlock}>
                  <Ionicons name="ban-outline" size={20} color="#D64545" />
                  <Text style={[styles.chatMenuText, styles.dangerText]}>
                    Block
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>
        </Pressable>
      </Modal>

      {/* CHAT WALLPAPER PICKER */}
      <WallpaperPicker
        visible={showWallpaperPicker}
        conversationId={conversationId}
        current={savedWallpaper}
        onPreview={setWallpaperPreview}
        onClose={() => setShowWallpaperPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ==========================================
// ATTACHMENT BUTTON
// ==========================================

function AttachmentButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;

  label: string;

  onPress: () => void;
}) {
  return (
    <Pressable style={styles.attachmentButton} onPress={onPress}>
      <View style={styles.attachmentIcon}>
        <Ionicons name={icon} size={26} color="#C5399A" />
      </View>

      <Text style={styles.attachmentLabel}>{label}</Text>
    </Pressable>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#EAF2FB" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FB",
  },

  centerText: { fontSize: 14, color: "#8A8A90" },

  // HEADER

  headerContainer: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,160,0.18)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  backButton: { marginRight: -2 },

  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(195,77,156,0.16)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  headerAvatarImage: { width: "100%", height: "100%" },

  headerAvatarWrap: { marginLeft: 4, position: "relative" },

  // Photo + name together: tap to open their profile.
  headerProfileTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },

  chatMenuBackdrop: {
    flex: 1,
  },

  chatMenu: {
    position: "absolute",
    right: 12,
    minWidth: 190,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEDF1",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  chatMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  chatMenuText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  blockedBar: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,160,0.18)",
  },

  blockedText: {
    fontSize: 13,
    color: "#6B6B72",
    textAlign: "center",
  },

  blockedButton: {
    minWidth: 120,
    height: 40,
    paddingHorizontal: 22,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  blockedButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  headerOnlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#25D366",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  headerText: { flex: 1, marginLeft: 10, marginRight: 12 },

  headerName: { fontSize: 16, fontWeight: "800", color: "#191922" },

  headerStatus: { fontSize: 12, color: "#8A8A90", marginTop: 1 },

  selectionTitle: {
    flex: 1,
    marginLeft: 18,
    fontSize: 19,
    fontWeight: "800",
    color: "#191922",
  },

  selectionActions: { flexDirection: "row", alignItems: "center", gap: 22 },

  // PINNED BANNER

  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,160,0.18)",
  },

  pinnedBannerText: { flex: 1 },

  pinnedBannerTitle: { fontSize: 11, fontWeight: "800", color: "#C5399A" },

  pinnedBannerBody: { fontSize: 12, color: "#555560", marginTop: 1 },

  // LOADING

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  loadingText: { marginTop: 10, fontSize: 13, color: "#8A8A90" },

  emptyChat: {
    transform: [{ scaleY: -1 }],
    alignItems: "center",
    paddingVertical: 40,
  },

  emptyChatText: { fontSize: 13, color: "#8A8A90" },

  // LIST

  messageListWrapper: { flex: 1 },

  list: { paddingVertical: 10 },

  // DATE SEPARATOR

  dateSeparatorContainer: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 6,
  },

  dateSeparator: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },

  dateSeparatorText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#777783",
    letterSpacing: 0.3,
  },

  // SWIPE TO REPLY

  swipeIconWrap: {
    position: "absolute",
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },

  swipeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },

  // MESSAGE ROW

  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
  },

  rowGroupStart: { marginTop: 8 },

  rowGroupContinue: { marginTop: 2 },

  rowWithReactions: { marginBottom: 12 },

  rowMine: { justifyContent: "flex-end" },

  rowTheirs: { justifyContent: "flex-start" },

  selectedRow: {
    backgroundColor: "rgba(197,57,154,0.16)",
  },

  avatarSlot: { width: 34, marginRight: 4, justifyContent: "flex-end" },

  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(195,77,156,0.15)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  messageAvatarImage: { width: "100%", height: "100%" },

  // BUBBLE

  bubbleColumn: { maxWidth: "80%", flexShrink: 1 },

  columnMine: { alignItems: "flex-end" },

  columnTheirs: { alignItems: "flex-start" },

  bubble: {
    minWidth: 62,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 6,
  },

  bubbleTheirs: { backgroundColor: "#FFFFFF" },

  bubbleMine: { backgroundColor: "#C5399A" },

  tailTheirs: { borderTopLeftRadius: 2 },

  tailMine: { borderTopRightRadius: 2 },

  mediaBubble: { padding: 3 },

  mediaPad: { paddingHorizontal: 6 },

  captionWrap: { paddingHorizontal: 6, paddingTop: 4, paddingBottom: 2 },

  senderName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#C5399A",
    marginBottom: 2,
  },

  bubbleText: {
    fontSize: 15,
    color: "#191922",
    lineHeight: 20,
    // Long links / words without spaces wrap INSIDE the bubble instead of
    // running out of it (browsers don't do this by themselves).
    ...(Platform.OS === "web"
      ? ({ wordBreak: "break-word", overflowWrap: "anywhere" } as object)
      : null),
  },

  bubbleTextMine: { color: "#FFFFFF" },

  metaSpacer: { opacity: 0 },

  deletedText: { fontStyle: "italic", opacity: 0.7 },

  // FORWARDED

  forwardedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },

  forwardedText: {
    fontSize: 11,
    fontStyle: "italic",
    color: "#8A8A90",
  },

  forwardedTextMine: { color: "rgba(255,255,255,0.85)" },

  // MESSAGE META

  messageMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  metaInline: { position: "absolute", right: 9, bottom: 5 },

  metaFlow: { alignSelf: "flex-end", marginTop: 2, paddingRight: 3 },

  metaOverlay: {
    position: "absolute",
    right: 7,
    bottom: 7,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  bubbleTime: { fontSize: 10.5, color: "#9C9CAA" },

  editedText: { fontSize: 10, fontStyle: "italic" },

  // REPLY

  replyPreview: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(197,57,154,0.08)",
    marginBottom: 5,
  },

  replyPreviewMine: { backgroundColor: "rgba(255,255,255,0.18)" },

  replyBar: { width: 4, backgroundColor: "#C5399A" },

  replyBarMine: { backgroundColor: "#FFFFFF" },

  replyBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },

  replyLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },

  replyPreviewTitle: { fontSize: 12, fontWeight: "800", color: "#C5399A" },

  replyPreviewTitleMine: { color: "#FFFFFF" },

  replyPreviewText: { flexShrink: 1, fontSize: 12, color: "#777783" },

  replyPreviewTextMine: { color: "rgba(255,255,255,0.85)" },

  // MEDIA

  mediaPressable: { borderRadius: 10, overflow: "hidden" },

  messageImage: { width: 230, height: 230, borderRadius: 10 },

  chatImageWrap: {
    backgroundColor: "#D9D9E2",
    overflow: "hidden",
  },

  chatImageLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },

  videoMessage: {
    width: 230,
    height: 170,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#15151B",
    position: "relative",
  },

  videoThumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25252D",
  },

  videoThumbnailImage: {
    width: "100%",
    height: "100%",
  },

  // Spinner on a photo that's still uploading.
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 10,
  },

  videoPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },

  // AUDIO

  audioMessage: {
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 2,
  },

  audioPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },

  audioPlayMine: { backgroundColor: "#FFFFFF" },

  audioBody: { flex: 1 },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 26,
  },

  waveBar: { width: 3, borderRadius: 2 },

  audioLine: {
    height: 3,
    flex: 1,
    borderRadius: 3,
    backgroundColor: "#D8D8DF",
  },

  audioText: { fontSize: 11, color: "#777783", marginTop: 1 },

  audioMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 1,
  },

  audioTextMine: { color: "rgba(255,255,255,0.85)" },

  // Outer wrapper so the transcript block can sit below the play/wave
  // row while still being one visual unit inside the bubble.
  audioWrap: { minWidth: 220 },

  transcriptToggle: {
    paddingLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  transcriptBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,160,0.25)",
  },

  transcriptText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4C4C56",
    fontStyle: "italic",
  },

  transcriptTextMine: { color: "rgba(255,255,255,0.9)" },

  transcriptMore: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    color: "#C5399A",
  },

  transcriptMoreMine: { color: "#FFFFFF" },

  // The word currently being spoken, highlighted against the rest of
  // the (already-italic, muted) transcript text.
  transcriptWordActive: {
    color: "#C5399A",
    fontWeight: "700",
    fontStyle: "normal",
  },

  transcriptWordActiveMine: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontStyle: "normal",
    textDecorationLine: "underline",
  },

  transcriptLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  transcriptLoadingText: {
    fontSize: 12,
    color: "#8A8A90",
    fontStyle: "italic",
  },

  // CALL ENTRY

  callLog: {
    minWidth: 210,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    paddingRight: 6,
  },

  callLogIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  callLogIconMine: { backgroundColor: "#FFFFFF" },

  callLogIconTheirs: { backgroundColor: "rgba(197,57,154,0.12)" },

  callLogIconMissed: { backgroundColor: "rgba(229,72,77,0.12)" },

  callLogText: { flex: 1, minWidth: 0 },

  callLogTitle: { fontSize: 14.5, fontWeight: "700" },

  callLogDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },

  callLogDetail: { fontSize: 12, fontVariant: ["tabular-nums"] },

  // DOCUMENT

  documentMessage: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 200,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  documentMessageMine: { backgroundColor: "rgba(255,255,255,0.16)" },

  documentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(197,57,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  documentInfo: { flex: 1, marginLeft: 9 },

  documentName: { fontSize: 13, fontWeight: "700", color: "#191922" },

  documentNameMine: { color: "#FFFFFF" },

  documentLabel: { fontSize: 11, color: "#8A8A90", marginTop: 2 },

  documentLabelMine: { color: "rgba(255,255,255,0.75)" },

  // REACTIONS

  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -9,
  },

  reactionsMine: { justifyContent: "flex-end", marginRight: 6 },

  reactionsTheirs: { justifyContent: "flex-start", marginLeft: 6 },

  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.25)",
    elevation: 1,
  },

  reactionBadgeActive: {
    borderColor: "#C5399A",
    backgroundColor: "rgba(197,57,154,0.1)",
  },

  reactionEmoji: { fontSize: 13 },

  reactionCount: {
    fontSize: 11,
    color: "#666672",
    marginLeft: 3,
    fontWeight: "700",
  },

  // JUMP BUTTON

  jumpButton: {
    position: "absolute",
    right: 14,
    bottom: 84,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  newMessageBadge: {
    position: "absolute",
    top: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },

  newMessageBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },

  // VOICE HINT

  voiceHint: {
    alignSelf: "center",
    backgroundColor: "rgba(25,25,34,0.82)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    marginBottom: 6,
  },

  voiceHintText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  // EDIT / REPLY BAR

  editingBar: {
    paddingHorizontal: 8,
    paddingTop: 6,
  },

  editingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingRight: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ECECF0",
  },

  editingAccent: {
    alignSelf: "stretch",
    width: 4,
    backgroundColor: "#C5399A",
  },

  editingContent: { flex: 1, marginHorizontal: 10, paddingVertical: 8 },

  editingTitle: { fontSize: 12, fontWeight: "800", color: "#C5399A" },

  editingText: { fontSize: 12, color: "#777783", marginTop: 2 },

  // COMPOSER

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
  },

  inputPill: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingLeft: 6,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: "#ECECF0",
  },

  input: {
    flex: 1,
    // Lets the box shrink on narrow (phone-sized) browser windows, so the
    // attach / camera icons stay inside the pill instead of being pushed out.
    minWidth: 0,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    fontSize: 16,
    color: "#191922",
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none", resize: "none" } as object)
      : null),
  },

  pillIcon: {
    height: 44,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },

  circleRecording: { transform: [{ scale: 1.25 }] },

  // RECORDING

  recordingIndicator: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    minWidth: 0,
  },

  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#D64545",
    marginRight: 8,
  },

  recordingTime: {
    width: 38,
    fontSize: 14,
    fontWeight: "600",
    color: "#191922",
  },

  recordingWave: {
    width: 62,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    overflow: "hidden",
  },

  recordingBar: {
    width: 2.5,
    minHeight: 4,
    maxHeight: 25,
    borderRadius: 3,
    backgroundColor: "#C5399A",
    marginHorizontal: 1.2,
  },

  slideCancel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },

  slideCancelText: { fontSize: 12, color: "#8A8A90", fontWeight: "600" },

  // MENU (long press)

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  menuColumn: { width: "100%", maxWidth: 340, alignItems: "flex-start" },

  quickReactions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginBottom: 10,
    alignSelf: "stretch",
  },

  quickReaction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  quickReactionActive: { backgroundColor: "rgba(197,57,154,0.16)" },

  quickReactionText: { fontSize: 25 },

  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 6,
    alignSelf: "stretch",
  },

  menuPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F3",
    marginBottom: 2,
  },

  menuPreviewText: { flex: 1, fontSize: 12, color: "#8A8A90" },

  menuNoticeText: { color: "#1FA855", fontWeight: "700" },

  menuClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F5",
    marginLeft: 10,
  },

  deleteHint: {
    fontSize: 13,
    lineHeight: 19,
    color: "#6B6B72",
    marginBottom: 6,
  },

  deleteOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F3",
  },

  deleteOptionText: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#D64545",
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  menuItemText: { fontSize: 15, color: "#191922", fontWeight: "600" },

  dangerText: { color: "#D64545" },

  // SHEETS

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "flex-end",
  },

  actionSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "90%",
  },

  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#D5D5DA",
    alignSelf: "center",
    marginBottom: 16,
  },

  sheetScroll: { maxHeight: 340, flexGrow: 0 },

  actionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#191922",
    marginBottom: 8,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
  },

  actionText: { fontSize: 15, color: "#191922", fontWeight: "600" },

  cancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F3F3F6",
    borderRadius: 14,
  },

  cancelText: { fontSize: 15, fontWeight: "700", color: "#555560" },

  // FORWARD

  forwardPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },

  forwardPreviewText: { flex: 1, fontSize: 12, color: "#555560" },

  forwardSearchInput: {
    minHeight: 44,
    backgroundColor: "#F5F5F7",
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#191922",
    borderWidth: 1,
    borderColor: "#ECECF0",
    marginBottom: 6,
  },

  forwardSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#777783",
    marginTop: 10,
    marginBottom: 4,
  },

  forwardChatIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(197,57,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  forwardUserAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(197,57,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  forwardUserAvatarImage: { width: "100%", height: "100%" },

  forwardUserInfo: { flex: 1 },

  forwardUsername: { fontSize: 11, color: "#8A8A90", marginTop: 2 },

  forwardLoading: { paddingVertical: 18, alignItems: "center" },

  noUsersText: { fontSize: 13, color: "#8A8A90", paddingVertical: 12 },

  // ATTACHMENTS

  attachmentSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 26,
  },

  attachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 18,
    marginTop: 4,
  },

  attachmentButton: { width: "33.33%", alignItems: "center" },

  attachmentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(197,57,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  attachmentLabel: {
    fontSize: 12,
    color: "#555560",
    marginTop: 6,
    fontWeight: "600",
  },

  mediaViewerBackdrop: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },

  mediaViewerClose: {
    position: "absolute",
    top: 55,
    right: 20,
    zIndex: 5,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  fullscreenImage: { width: "100%", height: "78%" },

  fullscreenVideo: { width: "100%", height: "78%" },

  attachmentPreviewScreen: {
    flex: 1,
    backgroundColor: "#000000",
  },

  attachmentPreviewHeader: {
    height: 90,
    paddingTop: 38,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  attachmentPreviewTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  attachmentPreviewContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  attachmentPreviewImage: {
    width: "100%",
    height: "78%",
  },

  documentPreviewCard: {
    width: "82%",
    minHeight: 210,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  documentPreviewIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(197,57,154,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  documentPreviewName: {
    color: "#191922",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  documentPreviewHint: {
    color: "#8A8A90",
    fontSize: 12,
    marginTop: 6,
  },

  attachmentPreviewComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 28,
    paddingTop: 8,
    gap: 10,
  },

  attachmentCaptionInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 14,
    color: "#191922",
  },

  attachmentSendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },
});
