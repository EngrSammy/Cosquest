import { apiRequest } from "./api";

// ==========================================
// SPARKS (sub-conversations surfaced from a group chat)
// ==========================================

export type Spark = {
  id: string;
  conversationId: string;
  subject: string;
  summary: string;
  summarizedByAi: boolean;
  keywords: string[];
  // Pulsing circle while active; quiet card otherwise. Pinned never fades.
  active: boolean;
  pinned: boolean;
  // Has a past (revived): pulses in a different colour.
  revived: boolean;
  eras: { index: number; startedAt: string }[];
  messageCount: number;
  participantCount: number;
  createdBy: string | null;
  startedByBot: boolean;
  lastActivityAt: string;
  createdAt: string;
  // Figma M32 (concept): who the Sparks bot notified automatically, by
  // expertise role. Filled by the backend's Sparks module from the SDK's
  // role-ping jobs; older backends leave it out.
  rolePings?: SparkRolePing[];
};

export type SparkRolePing = { role: string; userIds: string[]; at: string };

// A chat member as the Sparks module sees them (expertise roles, admin).
export type SparkMember = { userId: string; displayName: string; roles: string[]; isAdmin: boolean; rank?: any };

export type SparkSeam = { beforeMessageId: string; label: string };

// Tag on a chat message.
export type MessageSparkTag = { id: string; era: number; postedInSpark?: boolean };

// ---------- colours ----------
// Figma M07/M09: new Sparks are pink. A revived Spark's history runs on a
// gradient from purple (past) to teal (today) - "a gradient, not two tones",
// so a Spark revived many times keeps extending the same scale.
const PINK = "#B63D91";
const PAST = [158, 111, 207]; // #9E6FCF
const TODAY = [42, 138, 146]; // #2A8A92

export function eraColor(era: number, totalEras: number) {
  if (totalEras <= 1) return PINK;
  const t = Math.min(1, Math.max(0, era / (totalEras - 1)));
  const mix = PAST.map((from, i) => Math.round(from + (TODAY[i] - from) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export function sparkColor(spark: Pick<Spark, "revived">) {
  return spark.revived ? "#2A8A92" : PINK;
}

// "Nov 2025"
export function monthYear(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString([], { month: "short", year: "numeric" });
}

// ---------- requests ----------

function base(conversationId: string) {
  return `/api/chats/${encodeURIComponent(conversationId)}/sparks`;
}

export async function listSparks(conversationId: string, token: string) {
  const response = await apiRequest<any>(base(conversationId), { token });
  return { sparks: (response?.sparks || []) as Spark[], canManage: !!response?.canManage };
}

export async function getSpark(conversationId: string, sparkId: string, token: string) {
  const response = await apiRequest<any>(`${base(conversationId)}/${encodeURIComponent(sparkId)}`, { token });
  return {
    spark: response?.spark as Spark,
    messages: (response?.messages || []).map((m: any) => ({ ...m, id: String(m?.id ?? m?._id ?? ""), conversationId })),
    seams: (response?.seams || []) as SparkSeam[],
    canManage: !!response?.canManage,
  };
}

export type StartSparkResult =
  | { ok: true; spark: Spark }
  | { ok: false; code: "similar_sparks"; matches: Spark[]; error: string }
  | { ok: false; code: "already_in_spark"; spark?: Spark; error: string };

// GET /api/chats/:id/sparks/members - names and expertise roles for the
// role-ping card (M32). Cached per chat for the session: it's one list per
// chat and roles rarely change.
const memberCache = new Map<string, Promise<SparkMember[]>>();

export function listSparkMembers(conversationId: string, token: string): Promise<SparkMember[]> {
  let pending = memberCache.get(conversationId);
  if (!pending) {
    pending = apiRequest<any>(`${base(conversationId)}/members`, { token })
      .then((response) => (Array.isArray(response?.members) ? response.members : []))
      .catch(() => {
        memberCache.delete(conversationId);
        return [];
      });
    memberCache.set(conversationId, pending);
  }
  return pending;
}

// Uses fetch directly so the "similar Sparks" answer (409) keeps its list.
export async function startSpark(
  conversationId: string,
  data: { messageId: string; subject: string; force?: boolean },
  token: string,
): Promise<StartSparkResult> {
  const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
  const response = await fetch(`${BASE_URL}${base(conversationId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);

  if (response.ok) return { ok: true, spark: body?.spark };
  if (response.status === 409 && body?.code === "similar_sparks") {
    return { ok: false, code: "similar_sparks", matches: body.matches || [], error: body.error };
  }
  if (response.status === 409 && body?.code === "already_in_spark") {
    return { ok: false, code: "already_in_spark", spark: body.spark, error: body.error };
  }
  throw new Error(body?.error || "Couldn't start the Spark.");
}

export async function addToSpark(conversationId: string, sparkId: string, messageId: string, token: string) {
  const response = await apiRequest<any>(`${base(conversationId)}/${encodeURIComponent(sparkId)}/messages`, {
    method: "POST",
    body: { messageId },
    token,
  });
  return response?.spark as Spark;
}

export async function pinSpark(conversationId: string, sparkId: string, pinned: boolean, token: string) {
  const response = await apiRequest<any>(`${base(conversationId)}/${encodeURIComponent(sparkId)}/pin`, {
    method: "PATCH",
    body: { pinned },
    token,
  });
  return response?.spark as Spark;
}

export async function deleteSpark(conversationId: string, sparkId: string, token: string) {
  return apiRequest(`${base(conversationId)}/${encodeURIComponent(sparkId)}`, { method: "DELETE", token });
}

export async function mergeSpark(conversationId: string, sparkId: string, intoSparkId: string, token: string) {
  const response = await apiRequest<any>(`${base(conversationId)}/${encodeURIComponent(sparkId)}/merge`, {
    method: "POST",
    body: { intoSparkId },
    token,
  });
  return response?.spark as Spark;
}

// A reply posted inside a Spark (it also shows in the main chat).
export async function replyInSpark(conversationId: string, sparkId: string, content: string, token: string) {
  const response = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: { content, sparkId },
    token,
  });
  const message = response?.message ?? response;
  return { ...message, id: String(message?.id ?? message?._id ?? ""), conversationId };
}
