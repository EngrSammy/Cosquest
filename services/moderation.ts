// ==========================================
// CALL MODERATION & STAGE (Emmanuel, "Calls: moderation, stage...")
// ==========================================
//   Voice chats: admins mute / unmute / remove / allow; the stage (speakers
//   and listeners), roles and raised hands.
//   Calls: whoever started the call mutes / removes.
// Errors come back as { error } (+ reason); apiRequest throws the text.
import { apiRequest } from "./api";

export type ModerationAction = "mute" | "unmute" | "remove" | "allow";

const enc = encodeURIComponent;

export function moderateVoice(roomId: string, userId: string, action: ModerationAction, token: string) {
  return apiRequest<any>(`/api/voice/${enc(roomId)}/members/${enc(userId)}/${action}`, { method: "POST", token });
}

export function moderateCall(callId: string, userId: string, action: ModerationAction, token: string) {
  return apiRequest<any>(`/api/calls/${enc(callId)}/members/${enc(userId)}/${action}`, { method: "POST", token });
}

export function setVoiceStage(roomId: string, on: boolean, token: string) {
  return apiRequest<any>(`/api/voice/${enc(roomId)}/stage`, { method: "POST", token, body: { on } });
}

export function setVoiceRole(roomId: string, userId: string, role: "speaker" | "listener", token: string) {
  return apiRequest<any>(`/api/voice/${enc(roomId)}/members/${enc(userId)}/role`, { method: "POST", token, body: { role } });
}

export function setVoiceHand(roomId: string, raised: boolean, token: string) {
  return apiRequest<any>(`/api/voice/${enc(roomId)}/hand`, { method: "POST", token, body: { raised } });
}
