// ==========================================
// PRIVATE CALL ON TOP - requests
// ==========================================
// Backend (Emmanuel, branch private-call-on-top):
//   POST /api/calls/:callId/private   { userId }  -> 201 { call, token, livekitUrl }
//   POST /api/voice/:roomId/private   { userId }  -> the same, from a voice chat
// Answer, decline and hang up with the usual /api/calls/:id/accept,
// /decline and /end. A private call's call:incoming carries
// call.privateOf (the main call or voice chat id) and privateOfType
// ("call" | "voice"). members[].away is on call:updated / voice:updated.
import { apiRequest } from "./api";
import { normalizeCall, type CallJoinInfo } from "./calls";

export type PrivateFrom = { kind: "call" | "voice"; id: string };

export async function startPrivateCallRequest(
  from: PrivateFrom,
  userId: string,
  token: string,
): Promise<CallJoinInfo> {
  const path =
    from.kind === "call"
      ? `/api/calls/${encodeURIComponent(from.id)}/private`
      : `/api/voice/${encodeURIComponent(from.id)}/private`;
  const response = await apiRequest<any>(path, { method: "POST", token, body: { userId } });
  if (!response?.call || !response?.token || !response?.livekitUrl) {
    throw new Error("The server did not return the private call details.");
  }
  return { call: normalizeCall(response.call), token: response.token, livekitUrl: response.livekitUrl };
}

// The call or voice chat a private call was started from.
export function privateOf(call: any): PrivateFrom | null {
  const id = call?.privateOf ? String(call.privateOf) : "";
  if (!id) return null;
  return { kind: call?.privateOfType === "voice" ? "voice" : "call", id };
}
