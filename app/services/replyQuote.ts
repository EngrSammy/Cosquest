// What a reply bubble quotes: who wrote the original and what it said.
//
// The chat backend sends a reply's original as a short quote,
// `{ id, senderName, preview }` (cosquest-backend chatController.js, the
// replyTo serializer). The chat screen read `sender.username` and `content`,
// which that shape never has, so every reply showed "Reply" / "Message".
// This reads the backend's shape and still accepts a full message (the app's
// own optimistic copy of a reply it just sent).

type ReplyToLike = {
  senderName?: string | null;
  preview?: string | null;
  content?: string | null;
  sender?: { username?: string | null; name?: string | null } | null;
};

export function replyQuote(
  replyTo: ReplyToLike | null | undefined,
  typeLabel?: string | null,
): { name: string; text: string } {
  const name =
    replyTo?.senderName || replyTo?.sender?.username || replyTo?.sender?.name || "Reply";
  const text = replyTo?.content || replyTo?.preview || typeLabel || "Message";
  return { name, text };
}
