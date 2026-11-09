// A message to bring into view when a chat screen next gets focus.
//
// Chat search is opened on top of the chat. "Open the chat" used to push a
// second copy of the chat (Back then showed the same chat again) and did not
// show the message found. Search now leaves the message id here and goes back;
// the chat takes it on focus and scrolls to it.

const pending = new Map<string, string>();

export function setChatFocus(conversationId: string, messageId: string) {
  pending.set(conversationId, messageId);
}

/** The message to show in this chat, once (later calls get null). */
export function takeChatFocus(conversationId?: string | null): string | null {
  if (!conversationId) return null;
  const messageId = pending.get(conversationId) ?? null;
  pending.delete(conversationId);
  return messageId;
}

// The chat on screen right now (task 059): a push for it is not shown as a
// banner, the messages are already arriving there.
let openChat: string | null = null;

export function setOpenChat(conversationId: string | null) {
  openChat = conversationId;
}

export function openChatId(): string | null {
  return openChat;
}
