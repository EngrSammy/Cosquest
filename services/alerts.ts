// ==========================================
// "FACTION IN DANGER" ALERTS (Emmanuel, item 5)
// ==========================================
//   Send from a call or voice chat (one per person every 5 minutes).
//   Everyone in the sender's faction gets it (socket "alert:faction", or a
//   high-priority push), can open it, and can Respond for 30 minutes.
import { apiRequest } from "./api";

export type FactionAlert = {
  alertId: string;
  from: { id: string; username?: string | null; name?: string | null; avatarKey?: string | null; avatarPhotoUrl?: string | null };
  factionKey: string;
  source: "call" | "voice";
  callId?: string | null;
  voiceRoomId?: string | null;
  conversationId?: string | null;
  message?: string | null;
  at: string;
  flareUntil?: string;
  respondUntil: string;
};

const enc = encodeURIComponent;

export function sendFactionAlert(kind: "call" | "voice", id: string, message: string, token: string) {
  return apiRequest<{ alert: FactionAlert }>(`/api/${kind === "call" ? "calls" : "voice"}/${enc(id)}/alert`, {
    method: "POST",
    token,
    body: message.trim() ? { message: message.trim() } : {},
  });
}

export function getFactionAlert(alertId: string, token: string) {
  return apiRequest<{ alert: FactionAlert; canRespond: boolean; responded: boolean; responderCount: number }>(
    `/api/alerts/${enc(alertId)}`,
    { token },
  );
}

// From a call: like accepting a call ({ call, token, livekitUrl, ... }).
// From a voice chat: like joining it ({ voiceRoom, token, livekitUrl, ... }).
export function respondToFactionAlert(alertId: string, token: string) {
  return apiRequest<any>(`/api/alerts/${enc(alertId)}/respond`, { method: "POST", token });
}
