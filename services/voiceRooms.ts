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
  conversationType: "community" | "faction" | "group";
  factionKey: string | null;
  active: boolean;
  startedBy: VoicePerson;
  startedAt?: string;
  // away: in a private call from this voice chat right now.
  members: {
    user: VoicePerson;
    joinedAt?: string;
    away?: boolean;
    // Stage (Emmanuel): speaker or listener, a listener's raised hand, muted by an admin.
    role?: "speaker" | "listener";
    handRaised?: boolean;
    mutedByAdmin?: boolean;
  }[];
  // Stage on: only speakers can talk.
  stage?: boolean;
  speakerCount?: number;
  memberCount: number;
  maxMembers: number;
};

export type VoiceJoinInfo = {
  voiceRoom: VoiceRoom;
  token: string;
  livekitUrl: string;
  // What I may do here: mute / remove people, run the stage, end it.
  canModerate?: boolean;
  canManageStage?: boolean;
  canEnd?: boolean;
};

// The ping interval the backend expects (it drops people after 90 s).
export const VOICE_PING_MS = 30_000;

export function voiceChatAllowed(type?: string | null) {
  // Community, faction and the groups people create.
  return type === "community" || type === "faction" || type === "group";
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
  return {
    voiceRoom,
    token: response.token,
    livekitUrl: response.livekitUrl,
    canModerate: Boolean(response.canModerate),
    canManageStage: Boolean(response.canManageStage),
    canEnd: Boolean(response.canEnd),
  };
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
