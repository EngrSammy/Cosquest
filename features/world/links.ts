// Where a link or a notification tap goes in the app (task 059). Pure: no
// React Native imports (tested in features/world/__tests__/links.test.ts).
//
// Links (cosquest:// or the website's https://<web>/...):
//   chat/<id>                     -> /chat/<id>
//   user/<name>, u/<name>, @<name> -> /user/<name>
//   play?...                      -> /play?... (the game, features/world/deepLink.ts)
//   group/join/<code>, invite/<code>, join/<code> -> /group/join/<code>
//   post/<id>                     -> /post/<id>
//   notifications                 -> /notifications
// Anything else: null (the router's own matching, then +not-found).

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const NAME = /^[A-Za-z0-9_.]{1,40}$/;

function split(url: string): { path: string[]; query: string } {
  let rest = url.trim();
  const scheme = rest.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    if (!/^cosquest:/i.test(scheme[0])) {
      const slash = rest.indexOf("/");
      rest = slash < 0 ? "" : rest.slice(slash);
    }
  }
  const hash = rest.indexOf("#");
  if (hash >= 0) rest = rest.slice(0, hash);
  const q = rest.indexOf("?");
  const query = q >= 0 ? rest.slice(q + 1) : "";
  const path = (q >= 0 ? rest.slice(0, q) : rest)
    .split("/")
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return { path, query };
}

export function routeForUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const { path, query } = split(url);
  // expo-router may hand over "--/..." (Expo Go style); drop it.
  if (path[0] === "--") path.shift();
  const [head, a, b] = path;
  if (!head) return null;
  // Exact shapes only: a longer path (cosquest://chat/<id>/message/<id>) is
  // left to the router and its "this link doesn't go anywhere" page.
  const n = path.length;
  const h = head.toLowerCase();
  if (h === "chat" && n === 2 && ID.test(a)) return `/chat/${a}`;
  if ((h === "user" || h === "u") && n === 2 && NAME.test(a)) return `/user/${a}`;
  if (h.startsWith("@") && n === 1 && NAME.test(head.slice(1))) return `/user/${head.slice(1)}`;
  if (h === "play" && n === 1) return query ? `/play?${query}` : "/play";
  if (h === "group" && a === "join" && n === 3 && ID.test(b)) return `/group/join/${b}`;
  if ((h === "invite" || h === "join") && n === 2 && ID.test(a)) return `/group/join/${a}`;
  if (h === "post" && n === 2 && ID.test(a)) return `/post/${a}`;
  if (h === "notifications" && n === 1) return "/notifications";
  return null;
}

/** The data a push carries (cosquest-backend src/utils/push.js). */
export type PushData = {
  type?: string;
  conversationId?: string | null;
  username?: string | null;
  link?: string | null;
  url?: string | null;
};

/**
 * Where tapping a notification goes: the chat for messages, mentions and
 * group news; the person for a follow; the game for game events (their
 * cosquest://play link); the notification centre otherwise.
 */
export function routeForNotification(data: PushData | null | undefined): string {
  const d = data ?? {};
  const link = typeof d.link === "string" ? d.link : typeof d.url === "string" ? d.url : null;
  if (link) {
    const route = routeForUrl(link);
    if (route) return route;
  }
  const chat = typeof d.conversationId === "string" && ID.test(d.conversationId) ? d.conversationId : null;
  switch (d.type) {
    case "message":
    case "mention":
    case "group":
      if (chat) return `/chat/${chat}`;
      break;
    case "follow":
      if (typeof d.username === "string" && NAME.test(d.username)) return `/user/${d.username}`;
      break;
    case "game":
      return "/play";
    default:
      if (chat) return `/chat/${chat}`;
  }
  return "/notifications";
}
