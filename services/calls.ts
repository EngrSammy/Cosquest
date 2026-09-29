import { apiRequest } from "./api";

export type CallType = "audio" | "video";

// ringing   → caller started it, nobody has answered yet
// accepted  → the other person answered
// declined  → the other person tapped Decline
// missed    → nobody answered within 45 seconds
// cancelled → the caller hung up before it was answered
// ended     → the call finished after being answered
export type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "missed"
  | "cancelled"
  | "ended";

// Same fields the backend's callerPreview() sends — the same shape as
// userPreview() in chatController, so avatars work like everywhere else:
// avatarPhotoUrl (uploaded photo) or avatarKey (one of the preset AVATARS).
export type CallPerson = {
  id: string;
  username?: string | null;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type Call = {
  id: string;
  conversationId: string;
  conversationType?: "dm";
  type: CallType;
  status: CallStatus;
  caller: CallPerson;
  createdAt?: string;
  answeredAt?: string | null;
  endedAt?: string | null;
};

// Returned whenever you are about to JOIN a call (starting or accepting):
// the call plus this user's LiveKit pass.
export type CallJoinInfo = {
  call: Call;
  token: string;
  livekitUrl: string;
};

/* =========================================================
   HELPERS
========================================================= */

export function normalizeCall(raw: any): Call {
  return {
    ...raw,
    id: String(raw?.id ?? raw?._id ?? ""),
    conversationId: String(raw?.conversationId ?? ""),
    caller: {
      ...(raw?.caller || {}),
      id: String(raw?.caller?.id ?? raw?.caller?._id ?? ""),
    },
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
   END / CANCEL
   POST /api/calls/:callId/end   (safe to call more than once)
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
