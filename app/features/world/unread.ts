// What the chat bubble over the game shows: the unread count and the last
// three conversations with something new. Pure: no React Native imports
// (tested in features/world/__tests__).

/** The few fields of a chat (services/chats.ts Chat) this needs. */
export type UnreadChat = {
  id: string;
  type?: string;
  title?: string;
  name?: string;
  unreadCount?: number;
  otherParticipant?: { username?: string; name?: string } | null;
  lastMessage?: { senderName?: string; preview?: string; createdAt?: string } | null;
};

export type UnreadPreview = { chatId: string; title: string; text: string };

export type UnreadSummary = { count: number; previews: UnreadPreview[] };

/** The name a chat goes by in a list. */
export function chatTitle(chat: UnreadChat): string {
  if (chat.type === "dm" || (!chat.type && chat.otherParticipant)) {
    const other = chat.otherParticipant;
    const name = other?.name?.trim() || other?.username?.trim();
    if (name) return name;
  }
  return chat.title?.trim() || chat.name?.trim() || "Chat";
}

function time(chat: UnreadChat): number {
  const t = chat.lastMessage?.createdAt ? Date.parse(chat.lastMessage.createdAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** The unread count (all chats) and up to `limit` newest unread previews. */
export function unreadSummary(chats: readonly UnreadChat[], limit = 3): UnreadSummary {
  let count = 0;
  const unread: UnreadChat[] = [];
  for (const chat of chats) {
    const n = Math.max(0, Math.floor(Number(chat.unreadCount) || 0));
    if (n <= 0) continue;
    count += n;
    unread.push(chat);
  }
  unread.sort((a, b) => time(b) - time(a));
  const previews = unread.slice(0, limit).map((chat) => {
    const isGroup = chat.type && chat.type !== "dm";
    const sender = chat.lastMessage?.senderName?.trim();
    const preview = chat.lastMessage?.preview?.trim() || "New message";
    return {
      chatId: chat.id,
      title: chatTitle(chat),
      text: (isGroup && sender ? `${sender}: ${preview}` : preview).slice(0, 140),
    };
  });
  return { count, previews };
}

/** "3", "99+": what fits on the bubble. */
export function badgeText(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

/** Do two summaries say the same thing? (Skip needless native calls.) */
export function sameSummary(a: UnreadSummary | null, b: UnreadSummary): boolean {
  if (!a || a.count !== b.count || a.previews.length !== b.previews.length) return false;
  return a.previews.every(
    (p, i) => p.chatId === b.previews[i].chatId && p.title === b.previews[i].title && p.text === b.previews[i].text,
  );
}
