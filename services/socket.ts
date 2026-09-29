import { io, Socket } from "socket.io-client";

// Socket.IO is attached to the same http.Server as Express (see
// server.js: initSocket(httpServer) shares one port with REST) — so the
// same base URL already used for REST calls is also the socket URL, no
// separate env var needed.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

let socket: Socket | null = null;

// Handshake auth: `io(url, { auth: { token } })` — the same bearer token
// already used for REST. Matches src/realtime/socket.js's io.use(...)
// middleware exactly (reads socket.handshake.auth.token first, falls
// back to a query param, which this doesn't need since auth is always
// available here).
export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(BASE_URL, {
    auth: {
      token,
    },
    transports: ["websocket"],
  });

  socket.on("connect_error", (error) => {
    // Most commonly an expired/invalid token (server's io.use middleware
    // rejects with "Invalid or expired token", "Session logged out", or
    // "Missing auth token") — surfaced here for visibility while wiring
    // this up; the reconnect itself is handled automatically by
    // socket.io-client's default reconnection behavior.
    console.error("SOCKET CONNECT ERROR:", error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

// ==========================================
// APP BACKGROUND / FOREGROUND
// ==========================================
// When the app goes to the background, disconnect so the backend marks
// you offline (Android can otherwise keep the connection alive for a long
// time, making you look "online" after you've left the app). When the app
// comes back, reconnect.
//
// Unlike disconnectSocket(), these keep the SAME socket object, so every
// listener already attached to it (messages, typing, presence, calls)
// keeps working after it reconnects — nothing needs to re-subscribe.

export function pauseSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function resumeSocket() {
  if (socket && !socket.connected) {
    socket.connect();
  }
}

// Matches the backend's socket.on("conversation:join", async (conversationId, ack) => {...})
// exactly — same membership check REST already uses (loadConversationForUser),
// same ack shape ({ ok: true } or { ok: false, error }).
export function joinConversation(
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({
        ok: false,
        error: "Socket not connected.",
      });

      return;
    }

    socket.emit(
      "conversation:join",
      conversationId,
      (ack: { ok: boolean; error?: string } | undefined) => {
        resolve(ack || { ok: false, error: "No response from server." });
      },
    );
  });
}

export function leaveConversation(conversationId: string) {
  socket?.emit("conversation:leave", conversationId);
}

// Matches the backend's socket.on("post:join", (postId, ack) => {...}) —
// no membership check on the server side (unlike conversation:join),
// since comments are already visible to anyone who can see the post via
// the plain REST GET.
export function joinPost(
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({
        ok: false,
        error: "Socket not connected.",
      });

      return;
    }

    socket.emit(
      "post:join",
      postId,
      (ack: { ok: boolean; error?: string } | undefined) => {
        resolve(ack || { ok: false, error: "No response from server." });
      },
    );
  });
}

export function leavePost(postId: string) {
  socket?.emit("post:leave", postId);
}

export function startTyping(conversationId: string) {
  socket?.emit("typing:start", conversationId);
}

export function stopTyping(conversationId: string) {
  socket?.emit("typing:stop", conversationId);
}
