// ==========================================
// SUPER ADMIN DASHBOARD - Quests & Events
// ==========================================
// Backend: /api/admin/quests, /api/admin/geocode (quests-backend-phase1).
import { type AuditItem, type Person, adminRequest } from "./admin";
import type { Paged } from "./adminContent";

export type Money = { amount: number; currency: string };
export type QuestStatus = "draft" | "upcoming" | "live" | "completed" | "cancelled";

export type AdminQuest = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string;
  hostName: string;
  kind: "quest" | "event";
  status: QuestStatus;
  isPublished: boolean;
  isSeedData: boolean;
  startsAt: string;
  endsAt: string;
  location: { name: string; address: string; city?: string; country?: string; lat: number; lng: number };
  prizePool: Money;
  entryFee: Money;
  maxParticipants: number;
  registrationCount: number;
  spacesRemaining: number;
  faction: string | null;
  requireAtVenue: boolean;
  venueRadiusMeters: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type QuestInput = {
  title: string;
  kind: "quest" | "event";
  description: string;
  coverImageUrl: string;
  startsAt: string;
  endsAt: string;
  location: { name: string; address: string; city: string; country: string; lat: number; lng: number };
  entryFee: { amount: number };
  prizePool: { amount: number };
  maxParticipants: number;
  requireAtVenue: boolean;
  venueRadiusMeters: number;
  publish?: boolean;
};

export type Place = { label: string; name: string; address: string; city: string; country: string; lat: number; lng: number };

const qs = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && query.set(k, String(v)));
  const text = query.toString();
  return text ? `?${text}` : "";
};

export const getQuestStats = () =>
  adminRequest<{ live: number; upcoming: number; drafts: number; completed: number; cancelled: number; registrationsThisWeek: number }>("/quests/stats");
export const listAdminQuests = (params: { tab?: string; kind?: string; q?: string; offset?: number }) => adminRequest<Paged<{ quests: AdminQuest[] }>>(`/quests${qs(params)}`);
export const getAdminQuest = (id: string) =>
  adminRequest<{
    quest: AdminQuest;
    counts: { registered: number; cancelled: number; completed: number; winner: number; paymentPending: number; paid: number };
    registrations: { id: string; user: Person & { email: string | null }; status: string; paymentStatus: string; at: string }[];
    history: AuditItem[];
  }>(`/quests/${id}`);
export const createQuest = (input: QuestInput) => adminRequest<{ quest: AdminQuest; auditEvent: string }>("/quests", { method: "POST", body: input });
export const updateQuest = (id: string, input: Partial<QuestInput>) => adminRequest<{ quest: AdminQuest; auditEvent: string | null }>(`/quests/${id}`, { method: "PATCH", body: input });
export const questAction = (id: string, action: "publish" | "unpublish" | "duplicate") => adminRequest<{ quest: AdminQuest; auditEvent: string | null }>(`/quests/${id}/${action}`, { method: "POST", body: {} });
export const cancelQuest = (id: string, reason: string) => adminRequest<{ quest: AdminQuest; registrantsNotified: number; auditEvent: string }>(`/quests/${id}/cancel`, { method: "POST", body: { reason } });
// Deletes for good: only when nobody is registered and no payments were ever made
// (409 has_registrations / has_orders otherwise: cancel instead).
export const deleteQuest = (id: string, reason: string) => adminRequest<{ deleted: boolean; auditEvent: string }>(`/quests/${id}`, { method: "DELETE", body: { reason } });
export const searchPlaces = (q: string) => adminRequest<{ places: Place[]; attribution: string }>(`/geocode${qs({ q })}`);

/** Uploads a cover image (website): opens the file picker, returns the hosted URL. */
export function pickAndUploadCover(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 5 * 1024 * 1024) return reject(new Error("Images can be up to 5 MB."));
      try {
        const raw = window.localStorage.getItem("cq_admin_session");
        const token = raw ? JSON.parse(raw).token : null;
        const form = new FormData();
        form.append("cover", file);
        const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/admin/quests/cover`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Couldn't upload the image.");
        resolve(data.url);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}
