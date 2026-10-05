import { apiRequest } from "./api";

export type CallType = "audio" | "video";

// The call as a whole:
// ringing   → nobody has answered yet
// accepted  → at least two people are talking
// declined  → everyone invited said no
// missed    → nobody answered within 45 seconds
// cancelled → the caller hung up before anyone answered
// ended     → the call finished after being answered
export type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "missed"
  | "cancelled"
  | "ended";

// Each person in a call (group calls):
// ringing  → their phone is ringing
// joined   → they're in the call
// declined → they said no
// missed   → they didn't answer in time
// left     → they were in the call and left
export type CallMemberStatus =
  | "ringing"
  | "joined"
  | "declined"
  | "missed"
  | "left";

// Same shape as userPreview() on the backend, so avatars work like
// everywhere else: avatarPhotoUrl (uploaded photo) or avatarKey (preset).
export type CallPerson = {
  id: string;
  username?: string | null;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type CallMember = {
  user: CallPerson;
  status: CallMemberStatus;
  invitedBy: string | null;
  invitedAt?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
};

export type Call = {
  id: string;
  conversationId: string;
  conversationType?: "dm";
  type: CallType;
  status: CallStatus;
  caller: CallPerson;
  // True once someone has been added to the call.
  isGroup: boolean;
  members: CallMember[];
  maxParticipants: number;
  createdAt?: string;
  answeredAt?: string | null;
  endedAt?: string | null;
};

// Returned whenever you are about to JOIN a call (starting, accepting or
// rejoining): the call plus this user's LiveKit pass.
export type CallJoinInfo = {
  call: Call;
  token: string;
  livekitUrl: string;
};

export type InviteSkipReason =
  | "not_found"
  | "unavailable"
  | "not_accepting_calls"
  | "busy"
  | "already_in_call"
  | "call_full";

export type InviteResult = {
  call: Call;
  invited: string[];
  skipped: {
    userId?: string;
    username?: string | null;
    reason: InviteSkipReason;
  }[];
};

const ACTIVE_STATUSES: CallStatus[] = ["ringing", "accepted"];

/* =========================================================
   HELPERS
========================================================= */

function normalizePerson(raw: any): CallPerson {
  return {
    ...(raw || {}),
    id: String(raw?.id ?? raw?._id ?? ""),
  };
}

export function normalizeCall(raw: any): Call {
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
    conversationId: String(raw?.conversationId ?? ""),
    caller: normalizePerson(raw?.caller),
    isGroup: Boolean(raw?.isGroup),
    maxParticipants: Number(raw?.maxParticipants) || 8,
    members: Array.isArray(raw?.members)
      ? raw.members.map((member: any) => ({
          ...member,
          user: normalizePerson(member?.user),
          invitedBy: member?.invitedBy ? String(member.invitedBy) : null,
        }))
      : [],
  };
}

function normalizeJoinInfo(response: any): CallJoinInfo {
  if (!response?.call || !response?.token || !response?.livekitUrl) {
    throw new Error("The server did not return call details.");
  }

  return {
    call: normalizeCall(response.call),
    token: response.token,
    livekitUrl: response.livekitUrl,
  };
}

// Your own user id, read from your sign-in token (its "sub" field).
export function userIdFromToken(token?: string | null): string | null {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(globalThis.atob(padded));

    return decoded?.sub ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}

export function isCallActive(call?: Call | null) {
  return !!call && ACTIVE_STATUSES.includes(call.status);
}

export function memberOf(
  call: Call | null | undefined,
  userId?: string | null,
) {
  if (!call || !userId) {
    return null;
  }

  return call.members.find((member) => member.user.id === userId) || null;
}

// Who rang this person: the person who added them (group calls), or the
// caller (a normal one-to-one call).
export function inviterOf(call: Call, userId?: string | null): CallPerson {
  const mine = memberOf(call, userId);
  const inviterId = mine?.invitedBy;

  if (inviterId) {
    const inviter = call.members.find((member) => member.user.id === inviterId);

    if (inviter) {
      return inviter.user;
    }
  }

  return call.caller;
}

// Everyone ringing or in the call, except you.
export function otherActiveMembers(call: Call, userId?: string | null) {
  return call.members.filter(
    (member) =>
      member.user.id !== userId &&
      (member.status === "joined" || member.status === "ringing"),
  );
}

export function personName(person?: CallPerson | null) {
  return person?.name || person?.username || "Someone";
}

/* =========================================================
   START CALL
   POST /api/chats/:conversationId/calls   { type }
========================================================= */

export async function startCallRequest(
  conversationId: string,
  type: CallType,
  token: string,
): Promise<CallJoinInfo> {
  const response = await apiRequest<any>(
    `/api/chats/${encodeURIComponent(conversationId)}/calls`,
    {
      method: "POST",
      body: { type },
      token,
    },
  );

  return normalizeJoinInfo(response);
}

/* =========================================================
   INCOMING CALL (safety net — sockets deliver it instantly)
   GET /api/calls/incoming
========================================================= */

export async function getIncomingCall(token: string): Promise<Call | null> {
  const response = await apiRequest<any>("/api/calls/incoming", {
    method: "GET",
    token,
  });

  return response?.call ? normalizeCall(response.call) : null;
}

/* =========================================================
   GET ONE CALL
   GET /api/calls/:callId
========================================================= */

export async function getCall(callId: string, token: string): Promise<Call> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}`,
    {
      method: "GET",
      token,
    },
  );

  return normalizeCall(response?.call);
}

/* =========================================================
   ACCEPT
   POST /api/calls/:callId/accept
========================================================= */

export async function acceptCallRequest(
  callId: string,
  token: string,
): Promise<CallJoinInfo> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}/accept`,
    {
      method: "POST",
      token,
    },
  );

  return normalizeJoinInfo(response);
}

/* =========================================================
   DECLINE
   POST /api/calls/:callId/decline
========================================================= */

export async function declineCallRequest(
  callId: string,
  token: string,
): Promise<Call> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}/decline`,
    {
      method: "POST",
      token,
    },
  );

  return normalizeCall(response?.call);
}

/* =========================================================
   END / LEAVE
   POST /api/calls/:callId/end   (safe to call more than once)
   In a group call this means "leave" — the others keep talking.
========================================================= */

export async function endCallRequest(
  callId: string,
  token: string,
): Promise<Call> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}/end`,
    {
      method: "POST",
      token,
    },
  );

  return normalizeCall(response?.call);
}

/* =========================================================
   ADD PEOPLE
   POST /api/calls/:callId/invite   { userIds?, usernames? }
========================================================= */

export async function inviteToCallRequest(
  callId: string,
  people: { userIds?: string[]; usernames?: string[] },
  token: string,
): Promise<InviteResult> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}/invite`,
    {
      method: "POST",
      body: people,
      token,
    },
  );

  return {
    call: normalizeCall(response?.call),
    invited: Array.isArray(response?.invited)
      ? response.invited.map(String)
      : [],
    skipped: Array.isArray(response?.skipped) ? response.skipped : [],
  };
}

/* =========================================================
   REJOIN an ongoing call you left or missed
   POST /api/calls/:callId/join
========================================================= */

export async function rejoinCallRequest(
  callId: string,
  token: string,
): Promise<CallJoinInfo> {
  const response = await apiRequest<any>(
    `/api/calls/${encodeURIComponent(callId)}/join`,
    {
      method: "POST",
      token,
    },
  );

  return normalizeJoinInfo(response);
}
