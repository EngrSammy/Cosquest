// ==========================================
// SUPER ADMIN DASHBOARD - Members and Groups (Phase 3)
// ==========================================
// Backend: /api/admin/members, /api/admin/groups (cosquest-admin-backend-phase3).
import { type AuditItem, type Person, adminRequest } from "./admin";
import type { Paged } from "./adminContent";

const qs = (params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

// ---------- Members ----------
export type MemberStatus = "active" | "muted" | "suspended" | "pending";

export type MemberRow = {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  avatarKey: string | null;
  avatarPhotoUrl: string | null;
  role: "super_admin" | "member";
  status: MemberStatus;
  faction: string | null;
  groups: number;
  lastActiveAt: string | null;
  createdAt: string;
};

export type Restriction = { until: string; forever: boolean; reason: string } | null;

export type MemberDetail = {
  member: MemberRow;
  details: { memberSince: string; onboardingComplete: boolean; faction: string | null; rank: string | null; bio: string };
  restrictions: { muted: Restriction; suspended: Restriction };
  groups: { id: string; name: string; role: string; joinedAt: string | null; mutedUntil: string | null; openReports: number }[];
  groupBans: { id: string; name: string; reason: string; at: string }[];
  safety: { id: string; number: string; targetType: string; reason: string; status: string; chat: string | null; conversationId: string | null; createdAt: string }[];
  history: AuditItem[];
};

export const getMemberStats = () =>
  adminRequest<{ total: number; active: { value: number; change: number | null }; newMembers: { value: number; change: number | null }; pending: number; muted: number; suspended: number }>(
    "/members/stats",
  );
export const listMembers = (params: { tab?: string; role?: string; group?: string; q?: string; offset?: number }) => adminRequest<Paged<{ members: MemberRow[] }>>(`/members${qs(params)}`);
export const getMember = (id: string) => adminRequest<MemberDetail>(`/members/${id}`);
export const restrictMember = (id: string, kind: "mute" | "suspend", duration: string, reason: string) =>
  adminRequest<{ member: MemberRow; auditEvent: string }>(`/members/${id}/${kind}`, { method: "POST", body: { duration, reason } });
export const liftRestriction = (id: string, kind: "unmute" | "unsuspend", reason: string) =>
  adminRequest<{ member: MemberRow; auditEvent: string }>(`/members/${id}/${kind}`, { method: "POST", body: { reason } });

// ---------- Groups ----------
export type GroupHealth = "reports" | "quiet" | "healthy" | "archived";

export type GroupRow = {
  id: string;
  name: string;
  description: string;
  kind: "open" | "private" | "faction";
  factionKey: string | null;
  scope: string;
  photoUrl: string | null;
  archived: boolean;
  owner: Person | null;
  members: number | null;
  messagesThisWeek: number;
  openReports: number;
  health: GroupHealth;
  joinMode: "instant" | "approval";
  createdAt: string;
};

export type GroupDetail = {
  group: GroupRow & {
    newMembersThisWeek: number;
    settings: { joinMode: "instant" | "approval"; whoCanAdd: "members" | "admins"; memberListVisibility: "members" | "admins"; slowModeSeconds: number; sizeLimit: number };
    bans: number;
  };
  admins: (Person & { role: string })[];
  requests: { id: string; user: Person | null; message: string; via: string; createdAt: string }[];
  history: AuditItem[];
};

export const getGroupStats = () =>
  adminRequest<{ total: number; active: number; newGroups: number; joinRequests: number; approvalGroups: number; withReports: number }>("/groups/stats");
export const listGroups = (params: { tab?: string; kind?: string; q?: string; offset?: number }) => adminRequest<Paged<{ groups: GroupRow[] }>>(`/groups${qs(params)}`);
export const getGroup = (id: string) => adminRequest<GroupDetail>(`/groups/${id}`);
export const updateGroupSettings = (id: string, body: { joinMode?: string; whoCanAdd?: string; memberListVisibility?: string; reason?: string }) =>
  adminRequest<{ auditEvent: string | null }>(`/groups/${id}/settings`, { method: "PATCH", body });
export const decideJoinRequest = (groupId: string, requestId: string, decision: "approve" | "decline") =>
  adminRequest<{ auditEvent: string }>(`/groups/${groupId}/requests/${requestId}/${decision}`, { method: "POST", body: {} });
export const setGroupArchived = (id: string, archived: boolean, reason: string) =>
  adminRequest<{ archived: boolean; auditEvent: string }>(`/groups/${id}/${archived ? "archive" : "restore"}`, { method: "POST", body: { reason } });
