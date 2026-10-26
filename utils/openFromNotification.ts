// ==========================================
// WHERE A NOTIFICATION OPENS (banners, phone pushes, the Notifications list)
// ==========================================
// The backend sends the same `data` on a banner and on a push
// (Emmanuel, "In-App Notification Banners"):
//   message + chatId            -> the chat
//   postId (like / comment / repost / post) -> the post (commentId: that comment)
//   scheduledCallId             -> the scheduled call's details
//   follow                      -> their profile (or Notifications)
//   chatId / conversationId     -> the chat (mentions, group notices)
//   call                        -> nothing (the ringing screen shows calls)
//   anything else               -> Notifications
import { router } from "expo-router";

export function openFromNotification(data: any, actor?: { username?: string | null } | null) {
  if (!data || typeof data !== "object") return;
  const type = String(data.type || "");
  if (type === "call") return;

  if (type === "message" && data.chatId) {
    router.push({ pathname: "/chat/[id]", params: { id: String(data.chatId) } });
    return;
  }
  if (data.postId) {
    router.push({
      pathname: "/post/[id]",
      params: { id: String(data.postId), ...(data.commentId ? { commentId: String(data.commentId) } : {}) },
    } as any);
    return;
  }
  if (data.scheduledCallId) {
    router.push({ pathname: "/group/scheduled-call/[callId]", params: { callId: String(data.scheduledCallId) } });
    return;
  }
  if (type === "follow") {
    const username = actor?.username || data.username;
    if (username) router.push({ pathname: "/user/[username]", params: { username: String(username) } });
    else router.push("/notifications");
    return;
  }
  const chatId = data.chatId || data.conversationId;
  if (chatId) {
    router.push({ pathname: "/chat/[id]", params: { id: String(chatId) } });
    return;
  }
  router.push("/notifications");
}
