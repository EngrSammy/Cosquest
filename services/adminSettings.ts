// ==========================================
// SUPER ADMIN DASHBOARD - Roles, Settings, Audit log (Phase 5)
// ==========================================
// Backend: /api/admin/roles, /settings, /audit (cosquest-admin-backend-phase5),
// and /api/admin/invitations (the invited person, with their app session).
import { type AuditItem, type Person, adminRequest } from "./admin";
import type { Paged } from "./adminContent";
import { apiRequest } from "./api";

const qs = (params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

// ---------- Roles ----------
export type AdminEntry = Person & { email: string | null; role: string; since: string | null; assignedBy: Person | null; lastActiveAt: string | null; you: boolean };
export type Invitation = { id: string; user: Person | null; email: string | null; role: string; reason: string; invitedBy: Person | null; status: string; expiresAt: string; createdAt: string };
export type MatrixRow = { capability: string; admin: string; member: string; rank: string };

export const getRoles = () =>
  adminRequest<{ admins: AdminEntry[]; invitations: Invitation[]; matrix: MatrixRow[]; accessReview: { lastAt: string; nextAt: string; lastBy: string | null } | null }>("/roles");
export const inviteAdmin = (member: string, reason: string) => adminRequest<{ invitation: Invitation; auditEvent: string }>("/roles/invitations", { method: "POST", body: { member, reason } });
export const resendInvitation = (id: string) => adminRequest<{ invitation: Invitation }>(`/roles/invitations/${id}/resend`, { method: "POST", body: {} });
export const revokeInvitation = (id: string, reason: string) => adminRequest<{ auditEvent: string }>(`/roles/invitations/${id}/revoke`, { method: "POST", body: { reason } });
export const revokeAdmin = (userId: string, reason: string) => adminRequest<{ auditEvent: string }>(`/roles/admins/${userId}/revoke`, { method: "POST", body: { reason } });
export const recordAccessReview = (note: string) => adminRequest<{ auditEvent: string }>("/roles/review", { method: "POST", body: { note } });

// The invited person (their app session, before they are an admin).
export type MyInvitation = { id: string; role: string; reason: string; invitedBy: Person | null; expiresAt: string };
export const getMyInvitations = (appToken: string) => apiRequest<{ invitations: MyInvitation[] }>("/api/admin/invitations/mine", { token: appToken });
export const answerInvitation = (appToken: string, id: string, accept: boolean) =>
  apiRequest<{ accepted: boolean }>(`/api/admin/invitations/${id}/${accept ? "accept" : "decline"}`, { method: "POST", token: appToken });

// ---------- Settings ----------
export type Settings = {
  identity: { name: string; url: string; description: string; emblemUrl: string | null; language: string; reportingTimeZone: string };
  guidelines: { title: string; standards: string; requireAcceptance: boolean };
  privacy: { visibility: "members" | "public"; allowMemberInvitations: boolean; showMemberDirectory: boolean; publicSearchIndexing: boolean };
  notifications: { highPriorityAlerts: boolean; joinRequestSummaries: boolean; roleChanges: boolean; dailyDigest: boolean; digestTime: string; digestTo: string };
  moderation: { reportRouting: string; newGroupSlowMode: number; defaultMuteDuration: string; prioritizeHarm: boolean; notifyAuthors: boolean };
  accessReview?: any;
};

export const getSettings = () => adminRequest<{ settings: Settings; version: number; updatedAt: string; updatedBy: Person | null; needsEmail: string[] }>("/settings");
export const saveSettings = (version: number, changes: Record<string, Record<string, unknown>>, reason: string) =>
  adminRequest<{ settings: Settings; version: number; changed: number; auditEvent: string | null }>("/settings", { method: "PATCH", body: { version, changes, reason } });

// ---------- Audit log ----------
export type AuditFilters = { q?: string; actor?: string; area?: string; action?: string; from?: string; to?: string; offset?: number };
export const getAuditStats = () => adminRequest<{ actions: number; actingAdmins: number; reportsDecided: number; roleChanges: number }>("/audit/stats");
export const listAudit = (filters: AuditFilters) => adminRequest<Paged<{ events: AuditItem[] }>>(`/audit${qs(filters)}`);
export const getAuditEvent = (id: string) =>
  adminRequest<{ event: AuditItem & { before: any; after: any; evidence: any; meta: any; actorRole: string }; report: { id: string; number: string; status: string; reason: string } | null }>(`/audit/${id}`);

/** Downloads the CSV (website only). */
export async function downloadAuditCsv(filters: AuditFilters) {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("cq_admin_session") : null;
  const token = raw ? JSON.parse(raw).token : null;
  const { offset, ...rest } = filters;
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/admin/audit/export${qs(rest)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Couldn't export the audit log.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cosquest-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
