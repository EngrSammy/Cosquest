import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FONTS } from "@/constants/fonts";
import { useAppDispatch } from "@/store/hooks";

import {
  createComment,
  fetchComments,
  likeCommentThunk,
  removeComment,
  unlikeCommentThunk,
} from "@/store/thunks/postThunks";

import { CommentItem } from "./CommentItem";

import { getSocket, joinPost, leavePost } from "@/services/socket";

type LikeState = {
  liked: boolean;
  count: number;
};

type CommentsResponse = {
  comments?: any[];
  commentCount?: number;
};

type CreateCommentResponse = {
  comment?: any;
  commentCount?: number;
};

// Same thresholds chat's voice recording uses.
const MIN_VOICE_MILLIS = 800;
const VOICE_CANCEL_THRESHOLD = -80;

// Safety net for a missed comment:edited event (transcripts arrive live).
const TRANSCRIPT_POLL_INTERVAL_MS = 20000;

// Figma: the quick emojis above the comment field.
const QUICK_EMOJIS = ["❤️", "🙌", "🔥", "👏", "😂", "😢", "😮", "😍"];

// Deliberately a module-level function (React Compiler purity rule).
function generateVoiceFileName() {
  return `comment-voice-${Date.now()}.m4a`;
}

/* =========================================================
   RECORDING INDICATOR
   Same component/behavior as chat's.
========================================================= */

function RecordingIndicator({
  durationMillis,
  metering,
  cancelArmed,
}: {
  durationMillis: number;
  metering?: number;
  cancelArmed: boolean;
}) {
  const [blink] = useState(() => new Animated.Value(1));

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

export function CommentsModal({
  visible,
  onClose,
  postId,
  postUsername,
  token,
  currentUserId,
  currentUsername,
  userAvatar,
  initialCount,
  onCountChange,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postUsername: string;
  token: string;
  currentUserId: string;
  currentUsername: string;
  userAvatar: any;
  initialCount: number;
  onCountChange: (count: number) => void;
}) {
  const dispatch = useAppDispatch();

  /* =========================================================
     COMMENTS
  ========================================================= */

  const [comments, setComments] = useState<any[]>([]);

  const [repliesByComment, setRepliesByComment] = useState<
    Record<string, any[]>
  >({});

  const [repliesOpen, setRepliesOpen] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);

  /* =========================================================
     INPUT
  ========================================================= */

  const [commentText, setCommentText] = useState("");

  const [replyingTo, setReplyingTo] = useState<any | null>(null);

  const [sending, setSending] = useState(false);

  const [commentCount, setCommentCount] = useState(initialCount);

  /* =========================================================
     VOICE COMMENT RECORDING
  ========================================================= */

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  const recorderState = useAudioRecorderState(audioRecorder);

  const recorderStateRef = useRef(recorderState);

  useEffect(() => {
    recorderStateRef.current = recorderState;
  }, [recorderState]);

  const [recordingBusy, setRecordingBusy] = useState(false);

  const [sendingVoice, setSendingVoice] = useState(false);

  const recordingPressActive = useRef(false);
  const releasedCancelled = useRef(false);
  const cancelArmedRef = useRef(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");

  const isRecording = recorderState.isRecording;

  const showVoiceHint = (text: string) => {
    setVoiceHint(text);

    setTimeout(() => setVoiceHint(""), 2200);
  };

  /* =========================================================
     COMMENT LIKE STATE (main comments and replies)
  ========================================================= */

  const [commentLikes, setCommentLikes] = useState<Record<string, LikeState>>(
    {},
  );

  // Prevent multiple like requests for the same comment at the same time.
  const [likingComments, setLikingComments] = useState<Record<string, boolean>>(
    {},
  );

  /* =========================================================
     UPDATE COMMENT COUNT
  ========================================================= */

  const updateCount = useCallback(
    (count: number) => {
      const safeCount = Math.max(0, count);

      setCommentCount(safeCount);
      onCountChange(safeCount);
    },
    [onCountChange],
  );

  /* =========================================================
     GET LIKE STATE (liked + likeCount, or likes)
  ========================================================= */

  const getCommentLikeState = useCallback((comment: any): LikeState => {
    return {
      liked: !!(comment?.liked ?? comment?.likedByMe),
      count: Number(comment?.likeCount ?? comment?.likes ?? 0),
    };
  }, []);

  /* =========================================================
     LOAD COMMENTS
  ========================================================= */

  const loadComments = useCallback(async () => {
    setLoading(true);

    try {
      const rawResult = await dispatch(
        fetchComments({
          postId,
          token,
        }),
      ).unwrap();

      const result = rawResult as CommentsResponse;

      const loadedComments = result?.comments ?? [];

      setComments(loadedComments);

      // Keep a just-tapped like while the server catches up.
      setCommentLikes((current) => {
        const updated = {
          ...current,
        };

        loadedComments.forEach((comment: any) => {
          if (!updated[comment.id]) {
            updated[comment.id] = getCommentLikeState(comment);
          }
        });

        return updated;
      });
    } catch (error) {
      Alert.alert(
        "Comments",
        error instanceof Error ? error.message : "Unable to load comments.",
      );
    } finally {
      setLoading(false);
    }
  }, [dispatch, postId, token, getCommentLikeState]);

  /* =========================================================
     RESET / LOAD WHEN MODAL OPENS
  ========================================================= */

  useEffect(() => {
    if (!visible) {
      return;
    }

    setCommentCount(initialCount);
    setCommentText("");
    setReplyingTo(null);
    setRepliesByComment({});
    setRepliesOpen({});
    setCommentLikes({});
    setLikingComments({});

    void loadComments();
  }, [visible, initialCount, loadComments]);

  /* =========================================================
     LOAD REPLIES
  ========================================================= */

  const loadReplies = useCallback(
    async (commentId: string) => {
      try {
        const rawResult = await dispatch(
          fetchComments({
            postId,
            token,
            parentComment: commentId,
          }),
        ).unwrap();

        const result = rawResult as CommentsResponse;

        const loadedReplies = result?.comments ?? [];

        setRepliesByComment((current) => ({
          ...current,
          [commentId]: loadedReplies,
        }));

        setCommentLikes((current) => {
          const updated = {
            ...current,
          };

          loadedReplies.forEach((reply: any) => {
            if (!updated[reply.id]) {
              updated[reply.id] = getCommentLikeState(reply);
            }
          });

          return updated;
        });

        setRepliesOpen((current) => ({
          ...current,
          [commentId]: true,
        }));
      } catch (error) {
        Alert.alert(
          "Replies",
          error instanceof Error ? error.message : "Unable to load replies.",
        );
      }
    },
    [dispatch, postId, token, getCommentLikeState],
  );

  /* =========================================================
     TRANSCRIPT POLLING (only while something is still transcribing)
  ========================================================= */

  useEffect(() => {
    if (!visible || !token) {
      return;
    }

    const interval = setInterval(() => {
      const openReplyThreadIds = Object.keys(repliesOpen).filter(
        (commentId) => repliesOpen[commentId],
      );

      const pendingInComments = comments.some(
        (comment) => comment?.media?.transcribing,
      );

      const pendingInReplies = openReplyThreadIds.some((commentId) =>
        (repliesByComment[commentId] || []).some(
          (reply) => reply?.media?.transcribing,
        ),
      );

      if (pendingInComments) {
        void loadComments();
      }

      if (pendingInReplies) {
        openReplyThreadIds.forEach((commentId) => {
          const hasPending = (repliesByComment[commentId] || []).some(
            (reply) => reply?.media?.transcribing,
          );

          if (hasPending) {
            void loadReplies(commentId);
          }
        });
      }
    }, TRANSCRIPT_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    visible,
    token,
    comments,
    repliesByComment,
    repliesOpen,
    loadComments,
    loadReplies,
  ]);

  /* =========================================================
     SOCKET — LIVE COMMENTS
  ========================================================= */

  useEffect(() => {
    if (!visible || !postId) {
      return;
    }

    const socket = getSocket();

    if (!socket) {
      return;
    }

    let cancelled = false;

    const doJoin = () => {
      joinPost(postId).then((ack) => {
        if (!ack.ok && !cancelled) {
          console.error("POST JOIN FAILED:", ack.error);
        }
      });
    };

    doJoin();

    // Room membership doesn't survive a dropped connection.
    socket.on("connect", doJoin);

    const handleCommentNew = (payload: { postId: string; comment: any }) => {
      if (payload.postId !== postId || !payload.comment) {
        return;
      }

      const comment = payload.comment;

      const isReply = Boolean(comment.parentComment);

      if (!isReply) {
        setComments((current) => {
          if (current.some((item) => item.id === comment.id)) {
            return current;
          }

          return [...current, comment];
        });

        setCommentLikes((current) => ({
          ...current,
          [comment.id]: getCommentLikeState(comment),
        }));

        return;
      }

      // A reply — only applied if that thread is already loaded.
      setRepliesByComment((current) => {
        const existing = current[comment.parentComment];

        if (!existing) {
          return current;
        }

        if (existing.some((item) => item.id === comment.id)) {
          return current;
        }

        return {
          ...current,
          [comment.parentComment]: [...existing, comment],
        };
      });

      setCommentLikes((current) => ({
        ...current,
        [comment.id]: getCommentLikeState(comment),
      }));

      // Keep "View 3 replies" accurate.
      setComments((current) =>
        current.map((item) =>
          item.id === comment.parentComment
            ? { ...item, replyCount: (item.replyCount || 0) + 1 }
            : item,
        ),
      );
    };

    const handleCommentEdited = (payload: { postId: string; comment: any }) => {
      if (payload.postId !== postId || !payload.comment) {
        return;
      }

      const comment = payload.comment;

      setComments((current) =>
        current.map((item) => (item.id === comment.id ? comment : item)),
      );

      if (comment.parentComment) {
        setRepliesByComment((current) => {
          const existing = current[comment.parentComment];

          if (!existing) {
            return current;
          }

          return {
            ...current,
            [comment.parentComment]: existing.map((item) =>
              item.id === comment.id ? comment : item,
            ),
          };
        });
      }
    };

    const handleCommentDeleted = (payload: {
      postId: string;
      commentIds: string[];
      parentComment: string | null;
      commentCount?: number;
    }) => {
      if (payload.postId !== postId || !payload.commentIds?.length) {
        return;
      }

      const removedIds = new Set(payload.commentIds);

      if (!payload.parentComment) {
        setComments((current) =>
          current.filter((item) => !removedIds.has(item.id)),
        );

        setRepliesByComment((current) => {
          const updated = { ...current };

          payload.commentIds.forEach((id) => {
            delete updated[id];
          });

          return updated;
        });
      } else {
        setComments((current) =>
          current.map((item) =>
            item.id === payload.parentComment
              ? {
                  ...item,
                  replyCount: Math.max(0, (item.replyCount || 0) - 1),
                }
              : item,
          ),
        );

        setRepliesByComment((current) => {
          const existing = current[payload.parentComment!];

          if (!existing) {
            return current;
          }

          return {
            ...current,
            [payload.parentComment!]: existing.filter(
              (item) => !removedIds.has(item.id),
            ),
          };
        });
      }

      setCommentLikes((current) => {
        const updated = { ...current };

        payload.commentIds.forEach((id) => {
          delete updated[id];
        });

        return updated;
      });

      if (typeof payload.commentCount === "number") {
        updateCount(payload.commentCount);
      }
    };

    const handleCommentLiked = (payload: {
      postId: string;
      commentId: string;
      likeCount: number;
    }) => {
      if (payload.postId !== postId) {
        return;
      }

      setCommentLikes((current) => {
        const existing = current[payload.commentId];

        if (!existing) {
          return current;
        }

        return {
          ...current,
          [payload.commentId]: {
            ...existing,
            count: payload.likeCount,
          },
        };
      });
    };

    socket.on("comment:new", handleCommentNew);
    socket.on("comment:edited", handleCommentEdited);
    socket.on("comment:deleted", handleCommentDeleted);
    socket.on("comment:liked", handleCommentLiked);

    return () => {
      cancelled = true;

      socket.off("connect", doJoin);
      socket.off("comment:new", handleCommentNew);
      socket.off("comment:edited", handleCommentEdited);
      socket.off("comment:deleted", handleCommentDeleted);
      socket.off("comment:liked", handleCommentLiked);

      leavePost(postId);
    };
  }, [visible, postId, getCommentLikeState, updateCount]);

  /* =========================================================
     TOGGLE REPLIES
  ========================================================= */

  const toggleReplies = useCallback(
    async (comment: any) => {
      if (repliesOpen[comment.id]) {
        setRepliesOpen((current) => ({
          ...current,
          [comment.id]: false,
        }));

        return;
      }

      await loadReplies(comment.id);
    },
    [repliesOpen, loadReplies],
  );

  /* =========================================================
     LIKE / UNLIKE COMMENT OR REPLY (a reply is also a comment)
  ========================================================= */

  const toggleCommentLike = useCallback(
    async (comment: any) => {
      const commentId = String(comment?.id ?? "");

      if (!commentId) {
        return;
      }

      if (likingComments[commentId]) {
        return;
      }

      const currentLikeState =
        commentLikes[commentId] || getCommentLikeState(comment);

      try {
        setLikingComments((current) => ({
          ...current,
          [commentId]: true,
        }));

        if (currentLikeState.liked) {
          const rawResult = await dispatch(
            unlikeCommentThunk({
              postId,
              commentId,
              token,
            }),
          ).unwrap();

          const result =
            rawResult && typeof rawResult === "object"
              ? (rawResult as any)
              : {};

          const serverCount =
            typeof result.likeCount === "number"
              ? result.likeCount
              : typeof result.count === "number"
                ? result.count
                : typeof result.comment?.likeCount === "number"
                  ? result.comment.likeCount
                  : Math.max(0, currentLikeState.count - 1);

          setCommentLikes((current) => ({
            ...current,
            [commentId]: {
              liked: false,
              count: serverCount,
            },
          }));
        } else {
          const rawResult = await dispatch(
            likeCommentThunk({
              postId,
              commentId,
              token,
            }),
          ).unwrap();

          const result =
            rawResult && typeof rawResult === "object"
              ? (rawResult as any)
              : {};

          const serverCount =
            typeof result.likeCount === "number"
              ? result.likeCount
              : typeof result.count === "number"
                ? result.count
                : typeof result.comment?.likeCount === "number"
                  ? result.comment.likeCount
                  : currentLikeState.count + 1;

          setCommentLikes((current) => ({
            ...current,
            [commentId]: {
              liked: true,
              count: serverCount,
            },
          }));
        }
      } catch (error) {
        Alert.alert(
          "Comment like",
          error instanceof Error
            ? error.message
            : "Unable to update comment like.",
        );
      } finally {
        setLikingComments((current) => {
          const updated = {
            ...current,
          };

          delete updated[commentId];

          return updated;
        });
      }
    },
    [
      dispatch,
      postId,
      token,
      commentLikes,
      likingComments,
      getCommentLikeState,
    ],
  );

  /* =========================================================
     APPLY A NEWLY CREATED COMMENT/REPLY TO LOCAL STATE
  ========================================================= */

  const applyNewComment = useCallback(
    (result: CreateCommentResponse) => {
      if (result?.comment) {
        if (replyingTo) {
          setRepliesByComment((current) => ({
            ...current,

            [replyingTo.id]: [
              ...(current[replyingTo.id] || []),
              result.comment,
            ],
          }));

          setCommentLikes((current) => ({
            ...current,

            [result.comment.id]: getCommentLikeState(result.comment),
          }));

          setRepliesOpen((current) => ({
            ...current,
            [replyingTo.id]: true,
          }));
        } else {
          setComments((current) => [...current, result.comment]);

          setCommentLikes((current) => ({
            ...current,

            [result.comment.id]: getCommentLikeState(result.comment),
          }));
        }
      }

      const nextCount =
        typeof result?.commentCount === "number"
          ? result.commentCount
          : commentCount + 1;

      updateCount(nextCount);
    },
    [replyingTo, commentCount, getCommentLikeState, updateCount],
  );

  /* =========================================================
     SEND COMMENT / REPLY (TEXT)
  ========================================================= */

  const sendComment = async () => {
    const text = commentText.trim();

    if (!text) {
      return;
    }

    try {
      setSending(true);

      const data: {
        body: string;
        parentComment?: string;
      } = {
        body: text,
      };

      if (replyingTo) {
        data.parentComment = replyingTo.id;
      }

      const rawResult = await dispatch(
        createComment({
          postId,
          token,
          data,
        }),
      ).unwrap();

      const result = rawResult as CreateCommentResponse;

      applyNewComment(result);

      setCommentText("");
      setReplyingTo(null);
    } catch (error) {
      Alert.alert(
        "Comment",
        error instanceof Error ? error.message : "Unable to add comment.",
      );
    } finally {
      setSending(false);
    }
  };

  /* =========================================================
     VOICE COMMENT — RECORD / SEND / CANCEL
     Press and hold to record, release to send, drag left to cancel.
  ========================================================= */

  const startVoiceRecording = async () => {
    if (recordingBusy || isRecording) {
      return;
    }

    try {
      setRecordingBusy(true);

      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone permission",
          "Please allow CosQuest to access your microphone to record a voice comment.",
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
        "Voice comment",
        error instanceof Error
          ? error.message
          : "Unable to start voice recording.",
      );
    } finally {
      setRecordingBusy(false);
    }
  };

  const finishVoiceRecording = async (cancelled: boolean) => {
    if (!audioRecorder.isRecording) {
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

      setSendingVoice(true);

      const data: {
        body?: string;
        parentComment?: string;
        file: {
          uri: string;
          name: string;
          type: string;
        };
      } = {
        // Any typed text rides along as an optional caption.
        body: commentText.trim() || undefined,
        file: {
          uri,
          name: voiceFileName,
          type: "audio/mp4",
        },
      };

      if (replyingTo) {
        data.parentComment = replyingTo.id;
      }

      const rawResult = await dispatch(
        createComment({
          postId,
          token,
          data,
        }),
      ).unwrap();

      const result = rawResult as CreateCommentResponse;

      applyNewComment(result);

      setCommentText("");
      setReplyingTo(null);
    } catch (error) {
      console.error("VOICE COMMENT SEND ERROR:", error);

      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
      } catch {
        // Ignore audio-session cleanup errors after a failed recording.
      }

      Alert.alert(
        "Voice comment",
        error instanceof Error
          ? error.message
          : "Unable to send voice comment.",
      );
    } finally {
      setRecordingBusy(false);
      setSendingVoice(false);
    }
  };

  const handleVoiceGrant = async () => {
    if (isRecording || recordingBusy) {
      return;
    }

    recordingPressActive.current = true;
    releasedCancelled.current = false;
    cancelArmedRef.current = false;
    setCancelArmed(false);

    await startVoiceRecording();

    // Finger lifted while the recorder was still starting.
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

  useEffect(() => {
    voiceHandlers.current = {
      grant: handleVoiceGrant,
      move: handleVoiceMove,
      release: handleVoiceRelease,
    };
  });

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
      // Interrupted (e.g. by the permission dialog): discard it.
      onPanResponderTerminate: () => {
        voiceHandlers.current.release(-9999);
      },
    }),
  ).current;

  /* =========================================================
     DELETE COMMENT / REPLY
  ========================================================= */

  const deleteComment = async (comment: any) => {
    Alert.alert(
      "Delete comment",
      "Are you sure you want to delete this comment?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },

        {
          text: "Delete",
          style: "destructive",

          onPress: async () => {
            try {
              const rawResult = await dispatch(
                removeComment({
                  postId,
                  commentId: comment.id,
                  token,
                }),
              ).unwrap();

              // removeComment returns { postId, commentId, result }
              const wrappedResult = rawResult as any;

              const result = wrappedResult?.result ?? wrappedResult ?? {};

              if (comment.parentComment) {
                // REPLY
                await loadReplies(comment.parentComment);

                setCommentLikes((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });

                setLikingComments((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });
              } else {
                // MAIN COMMENT (and its replies)
                setComments((current) =>
                  current.filter((item) => item.id !== comment.id),
                );

                setRepliesByComment((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });

                setRepliesOpen((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });

                setCommentLikes((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });

                setLikingComments((current) => {
                  const updated = {
                    ...current,
                  };

                  delete updated[comment.id];

                  return updated;
                });
              }

              const nextCount =
                typeof result?.commentCount === "number"
                  ? result.commentCount
                  : Math.max(0, commentCount - 1);

              updateCount(nextCount);
            } catch (error) {
              Alert.alert(
                "Delete comment",
                error instanceof Error
                  ? error.message
                  : "Unable to delete comment.",
              );
            }
          },
        },
      ],
    );
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.overlay} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* HEADER */}

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Comments</Text>

              <Text style={styles.count}>
                {commentCount} {commentCount === 1 ? "comment" : "comments"}
              </Text>
            </View>

            <Pressable style={styles.close} onPress={onClose}>
              <Ionicons name="close" size={23} color="#191922" />
            </Pressable>
          </View>

          {/* COMMENTS */}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#C5399A" />

              <Text style={styles.loadingText}>Loading comments...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={42}
                    color="#B0B0B7"
                  />

                  <Text style={styles.emptyTitle}>No comments yet</Text>
                </View>
              ) : (
                comments.map((comment) => {
                  const username =
                    comment?.author?.username || comment?.username || "User";

                  const normalizedUsername = username
                    .replace(/^@/, "")
                    .toLowerCase();

                  const normalizedCurrentUsername = currentUsername
                    .replace(/^@/, "")
                    .toLowerCase();

                  const normalizedPostUsername = postUsername
                    .replace(/^@/, "")
                    .toLowerCase();

                  const isMine =
                    comment?.author?.id === currentUserId ||
                    normalizedUsername === normalizedCurrentUsername;

                  const isAuthor =
                    normalizedUsername === normalizedPostUsername;

                  const likeState =
                    commentLikes[comment.id] || getCommentLikeState(comment);

                  return (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      replies={repliesByComment[comment.id] || []}
                      repliesOpen={!!repliesOpen[comment.id]}
                      isPostAuthor={isAuthor}
                      isMine={isMine}
                      onReply={() => setReplyingTo(comment)}
                      onToggleReplies={() => toggleReplies(comment)}
                      onDelete={() => deleteComment(comment)}
                      onDeleteReply={(reply) => deleteComment(reply)}
                      onReplyToReply={(reply) => setReplyingTo(reply)}
                      currentUserId={currentUserId}
                      currentUsername={currentUsername}
                      onLike={() => {
                        void toggleCommentLike(comment);
                      }}
                      liked={likeState.liked}
                      likeCount={likeState.count}
                      replyLikes={commentLikes}
                      onLikeReply={(reply) => {
                        void toggleCommentLike(reply);
                      }}
                    />
                  );
                })
              )}

              <View style={styles.bottomSpace} />
            </ScrollView>
          )}

          {/* FOOTER */}

          <View style={styles.footer}>
            {replyingTo ? (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to @{replyingTo?.author?.username || "user"}
                </Text>

                <Pressable onPress={() => setReplyingTo(null)}>
                  <Ionicons name="close-circle" size={21} color="#9C9CAA" />
                </Pressable>
              </View>
            ) : null}

            {voiceHint ? (
              <View style={styles.voiceHint}>
                <Text style={styles.voiceHintText}>{voiceHint}</Text>
              </View>
            ) : null}

            {/* QUICK EMOJIS (Figma: plain, spread across the width) -
                hidden while recording. */}
            {!isRecording ? (
              <View style={styles.reactions}>
                {QUICK_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.reaction}
                    hitSlop={6}
                    onPress={() =>
                      setCommentText((current) => current + emoji)
                    }>
                    <Text style={styles.reactionText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* INPUT */}

            <View style={styles.inputRow}>
              <Image
                source={userAvatar}
                style={styles.inputAvatar}
                contentFit="cover"
              />

              <View style={styles.inputPill}>
                {isRecording ? (
                  <RecordingIndicator
                    durationMillis={recorderState.durationMillis}
                    metering={recorderState.metering}
                    cancelArmed={cancelArmed}
                  />
                ) : (
                  <TextInput
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder={
                      replyingTo
                        ? `Reply to @${replyingTo?.author?.username || "user"}...`
                        : `Add comment for ${postUsername || "this post"}...`
                    }
                    placeholderTextColor="#A58FA0"
                    style={styles.input}
                    multiline
                    maxLength={500}
                    editable={!sendingVoice}
                  />
                )}
              </View>

              {/* MIC — hold to record, release to send, drag left to
                  cancel. Send replaces it once there's typed text. */}
              {!commentText.trim() ? (
                <View
                  style={[styles.mic, isRecording && styles.micRecording]}
                  accessibilityRole="button"
                  accessibilityLabel="Hold to record voice comment"
                  {...micPanResponder.panHandlers}>
                  {sendingVoice ? (
                    <ActivityIndicator size="small" color="#C34D9C" />
                  ) : (
                    <Ionicons name="mic-outline" size={19} color="#C34D9C" />
                  )}
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.send,
                    !commentText.trim() && styles.sendDisabled,
                  ]}
                  onPress={sendComment}
                  disabled={!commentText.trim() || sending}>
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={17} color="#FFFFFF" />
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  sheet: {
    height: "82%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#C7C7CC",
    marginBottom: 18,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },

  title: {
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: "#191922",
  },

  count: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#92929A",
  },

  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
  },

  list: {
    flex: 1,
    minHeight: 0,
  },

  listContent: {
    paddingTop: 4,
    paddingBottom: 10,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 10,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#8B8B93",
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 70,
  },

  emptyTitle: {
    marginTop: 12,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "#44444B",
  },

  bottomSpace: {
    height: 10,
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: "#EEEEF1",
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
  },

  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 7,
    backgroundColor: "rgba(197,57,154,0.07)",
  },

  replyBannerText: {
    color: "#C5399A",
    fontFamily: FONTS.semibold,
    fontSize: 12,
  },

  // Figma: plain emojis spread across the width (no circles).
  reactions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 12,
  },

  reaction: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },

  reactionText: {
    fontSize: 22,
  },

  voiceHint: {
    alignSelf: "center",
    backgroundColor: "rgba(25,25,34,0.82)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    marginBottom: 8,
  },

  voiceHintText: {
    color: "#FFFFFF",
    fontFamily: FONTS.medium,
    fontSize: 12,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  inputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  // Figma: light pink pill with a soft shadow.
  inputPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: "#C34D9C1F",
    borderWidth: 1,
    borderColor: "rgba(195,77,156,0.12)",
    justifyContent: "center",

    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  input: {
    minHeight: 40,
    maxHeight: 95,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 8,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: "#191922",
    ...(Platform.OS === "web"
      ? ({ outlineStyle: "none", resize: "none" } as object)
      : null),
  },

  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  sendDisabled: {
    opacity: 0.5,
  },

  // Matches the comment field: light pink circle, pink outline mic.
  mic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C34D9C1F",
    borderWidth: 1,
    borderColor: "rgba(195,77,156,0.12)",
  },

  micRecording: {
    transform: [{ scale: 1.15 }],
  },

  // RECORDING INDICATOR — same layout/values as chat's.

  recordingIndicator: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
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
    fontFamily: FONTS.semibold,
    fontSize: 14,
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

  slideCancelText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#8A8A90",
  },

  dangerText: {
    color: "#D64545",
  },
});
