import { apiRequest } from "./api";

// ==========================================
// VOICE CHATS (Community and faction rooms; nobody's phone rings)
// ==========================================
// Backend: src/controllers/voiceRoomController.js
//   GET  /api/chats/:conversationId/voice        is one live here?
//   POST /api/chats/:conversationId/voice/join   start it, or join it
//   POST /api/voice/:roomId/ping                 "still here" (every 30 s)
//   POST /api/voice/:roomId/leave
// Socket: "voice:updated" { conversationId, voiceRoom } (null = closed).

export type VoicePerson = {
  id: string;
  username?: string | null;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type VoiceRoom = {
  id: string;
  conversationId: string;
  conversationType: "community" | "faction";
  factionKey: string | null;
  active: boolean;
  startedBy: VoicePerson;
  startedAt?: string;
  members: { user: VoicePerson; joinedAt?: string }[];
  memberCount: number;
  maxMembers: number;
};

export type VoiceJoinInfo = {
  voiceRoom: VoiceRoom;
  token: string;
  livekitUrl: string;
};

// The ping interval the backend expects (it drops people after 90 s).
export const VOICE_PING_MS = 30_000;

export function voiceChatAllowed(type?: string | null) {
  return type === "community" || type === "faction";
}

function person(raw: any): VoicePerson {
  return { ...(raw || {}), id: String(raw?.id ?? raw?._id ?? "") };
}

export function normalizeVoiceRoom(raw: any): VoiceRoom | null {
  if (!raw) return null;
  return {
    ...raw,
    id: String(raw.id ?? raw._id ?? ""),
    conversationId: String(raw.conversationId ?? ""),
    startedBy: person(raw.startedBy),
    members: Array.isArray(raw.members)
      ? raw.members.map((member: any) => ({ ...member, user: person(member?.user) }))
      : [],
    memberCount: Number(raw.memberCount) || 0,
    maxMembers: Number(raw.maxMembers) || 50,
  };
}

export async function getVoiceRoom(conversationId: string, token: string) {
  const response = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/voice`, { token });
  return normalizeVoiceRoom(response?.voiceRoom);
}

export async function joinVoiceRoom(conversationId: string, token: string): Promise<VoiceJoinInfo> {
  const response = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/voice/join`, {
    method: "POST",
    token,
  });
  const voiceRoom = normalizeVoiceRoom(response?.voiceRoom);
  if (!voiceRoom || !response?.token || !response?.livekitUrl) {
    throw new Error("The server did not return the voice chat details.");
  }
  return { voiceRoom, token: response.token, livekitUrl: response.livekitUrl };
}

export async function pingVoiceRoom(roomId: string, token: string) {
  const response = await apiRequest<any>(`/api/voice/${encodeURIComponent(roomId)}/ping`, {
    method: "POST",
    token,
  });
  return normalizeVoiceRoom(response?.voiceRoom);
}

export async function leaveVoiceRoom(roomId: string, token: string) {
  try {
    await apiRequest<any>(`/api/voice/${encodeURIComponent(roomId)}/leave`, { method: "POST", token });
  } catch {
    // Leaving twice (or after it closed) is fine.
  }
}
