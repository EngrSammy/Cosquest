// ==========================================
// NOTIFICATION BUTTONS: Reply and Mark as read (like WhatsApp)
// ==========================================
// Message pushes carry categoryId 'message' (backend), so the phone shows
//   Reply        type and send without opening CosQuest
//   Mark as read the chat is marked read
// Both run in the background with the saved login (utils/sessionStorage),
// through the normal API (POST /api/chats/:id/messages, PATCH .../read).
// They work when CosQuest is in the background or closed (a background
// task, expo-task-manager), not only when it's open.
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { loadSavedToken } from "@/utils/sessionStorage";

const API = process.env.EXPO_PUBLIC_API_URL;
export const MESSAGE_CATEGORY = "message";
const TASK = "cosquest-notification-actions";

export async function setupNotificationActions() {
  if (Platform.OS === "web") return;
  try {
    await Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY, [
      {
        identifier: "reply",
        buttonTitle: "Reply",
        textInput: { submitButtonTitle: "Send", placeholder: "Message" },
        options: { opensAppToForeground: false },
      },
      { identifier: "read", buttonTitle: "Mark as read", options: { opensAppToForeground: false } },
    ]);
  } catch {}
}

async function call(path: string, method: string, body?: unknown) {
  const token = await loadSavedToken();
  if (!token || !API) throw new Error("signed out");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function failed(text: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title: "CosQuest", body: text }, trigger: null });
  } catch {}
}

/**
 * A button on a notification was used: true if it was Reply / Mark as read
 * (handled here, nothing to open), false for a normal tap.
 */
export async function handleNotificationAction(response: { actionIdentifier?: string; userText?: string; notification?: any } | null | undefined) {
  const action = response?.actionIdentifier;
  if (action !== "reply" && action !== "read") return false;
  const request = response?.notification?.request;
  const data = request?.content?.data || {};
  const chatId = data.chatId ? String(data.chatId) : "";
  if (!chatId) return true;
  try {
    if (action === "reply") {
      const text = String(response?.userText || "").trim();
      if (text) {
        await call(`/api/chats/${chatId}/messages`, "POST", { content: text.slice(0, 2000), ...(data.messageId ? { replyTo: String(data.messageId) } : {}) });
      }
    }
    // Replying also means it's been read.
    await call(`/api/chats/${chatId}/read`, "PATCH");
    if (request?.identifier) await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
  } catch {
    await failed(action === "reply" ? "Your reply wasn't sent. Open CosQuest to try again." : "Couldn't mark it as read.");
  }
  return true;
}

// Closed / in the background: the phone starts this task for the button.
TaskManager.defineTask(TASK, async ({ data }: any) => {
  try {
    const response = data?.actionIdentifier ? data : data?.response || data?.notificationResponse || null;
    if (response) await handleNotificationAction(response);
  } catch {}
});

export function registerNotificationActionsTask() {
  if (Platform.OS === "web") return;
  Notifications.registerTaskAsync(TASK).catch(() => {});
}
