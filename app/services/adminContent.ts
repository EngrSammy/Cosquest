// ==========================================
// SUPER ADMIN DASHBOARD - Moderation, Feeds, Chats (Phase 2)
// ==========================================
// Backend: /api/admin/reports, /feeds, /chats (cosquest-admin-backend-phase2).
import { type AuditItem, type Person, adminRequest } from "./admin";

const qs = (params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

export type Paged<T> = T & { total: number; nextOffset: number | null };

// ---------- Moderation ----------
export type ReportStatus = "new" | "in_review" | "resolved" | "dismissed";
export type TargetType = "post" | "comment" | "message" | "profile";
export type DecisionAction = "remove_post" | "remove_comment" | "delete_message" | "dismiss";

export type Report = {
  id: string;
  number: string;
  targetType: TargetType;
  targetId: string;
  reason: string;
  priority: "high" | "standard";
  status: ReportStatus;
  reporterCount: number;
  snapshot: any;
  targetUser: Person | null;
  assignee: Person | null;
  conversationId: string | null;
  postId: string | null;
  decision: { action: string; reason: string; by: Person | null; at: string } | null;
  createdAt: string;
  reporters?: { user: Person | null; reason: string; statement: string; at: string }[];
};

export type ReportDetail = {
  report: Report;
  target: any;
  author: { joinedAt: string | null; posts: number; reportsAgainst: number; previousActions: number } | null;
  actions: DecisionAction[];
  history: AuditItem[];
};

export const getReportStats = () => adminRequest<{ open: number; new: number; inReview: number; high: number; resolvedToday: number }>("/reports/stats");

export const listReports = (params: { status?: string; type?: string; priority?: string; assignee?: string; q?: string; offset?: number }) =>
  adminRequest<Paged<{ reports: Report[] }>>(`/reports${qs(params)}`);

export const getReport = (id: string) => adminRequest<ReportDetail>(`/reports/${id}`);
export const assignReport = (id: string) => adminRequest<{ report: Report }>(`/reports/${id}/assign`, { method: "POST", body: {} });
export const decideReport = (id: string, body: { action: DecisionAction; reason: string; notifyAuthor: boolean }) =>
  adminRequest<{ report: Report; auditEvent: string | null }>(`/reports/${id}/decision`, { method: "POST", body });

// ---------- Feeds ----------
export type AdminPost = {
  id: string;
  label: string;
  type: "image" | "reel" | "thought" | "share";
  text: string;
  media: { url: string; kind: "image" | "video" }[];
  author: Person | null;
  reactions: number;
  comments: number;
  shares: number;
  status: "published" | "removed";
  removed: { at: string; reason: string; by: string | null } | null;
  openReports: number;
  editedAt: string | null;
  createdAt: string;
};

export const getFeedStats = () => adminRequest<{ posts: number; reactions: number; openReports: number; removed: number }>("/feeds/stats");
export const listPosts = (params: { tab?: string; type?: string; q?: string; offset?: number }) => adminRequest<Paged<{ posts: AdminPost[] }>>(`/feeds/posts${qs(params)}`);
export const getPost = (id: string) => adminRequest<{ post: AdminPost; reports: Report[]; history: AuditItem[] }>(`/feeds/posts/${id}`);
export const removePost = (id: string, reason: string, notifyAuthor: boolean) =>
  adminRequest<{ post: AdminPost; auditEvent: string }>(`/feeds/posts/${id}/remove`, { method: "POST", body: { reason, notifyAuthor } });
export const restorePost = (id: string, reason: string) => adminRequest<{ post: AdminPost; auditEvent: string }>(`/feeds/posts/${id}/restore`, { method: "POST", body: { reason } });

// ---------- Chats ----------
export type AdminConversation = {
  id: string;
  type: "group" | "community" | "faction";
  name: string;
  kind: string | null;
  photoUrl: string | null;
  members: number | null;
  slowModeSeconds: number;
  messagesThisWeek: number;
  openReports: number;
  lastMessage: { text: string; sender: Person | null; at: string } | null;
};

export type AdminMessage = {
  id: string;
  kind: string;
  text: string | null;
  media: string | null;
  deleted: boolean;
  deletedByAdmin: boolean;
  sender: Person | null;
  role: "owner" | "admin" | "member" | null;
  report: { id: string; number: string; reason: string; status: ReportStatus } | null;
  createdAt: string;
  editedAt: string | null;
};

export const getChatStats = () => adminRequest<{ messages: number; activeGroups: number; totalGroups: number; openReports: number; slowMode: number }>("/chats/stats");
export const listConversations = (params: { filter?: string; q?: string; offset?: number }) =>
  adminRequest<Paged<{ conversations: AdminConversation[] }>>(`/chats/conversations${qs(params)}`);
export const getMessages = (conversationId: string, around?: string | null) =>
  adminRequest<{ conversation: { id: string; type: string; name: string; kind: string | null; slowModeSeconds: number; owner: string | null }; messages: AdminMessage[] }>(
    `/chats/conversations/${conversationId}/messages${qs({ around: around || undefined })}`,
  );
export const deleteMessage = (messageId: string, reason: string, notifyAuthor: boolean) =>
  adminRequest<{ deleted: boolean; auditEvent: string }>(`/chats/messages/${messageId}/delete`, { method: "POST", body: { reason, notifyAuthor } });
export const setSlowMode = (conversationId: string, seconds: number) =>
  adminRequest<{ slowModeSeconds: number }>(`/chats/conversations/${conversationId}/slow-mode`, { method: "POST", body: { seconds } });
export const memberAction = (conversationId: string, userId: string, action: "mute" | "unmute" | "remove" | "ban", body: { reason?: string; duration?: string }) =>
  adminRequest<{ member: { id: string; role: string | null; mutedUntil: string | null }; auditEvent: string }>(
    `/chats/conversations/${conversationId}/members/${userId}/${action}`,
    { method: "POST", body },
  );

// ---------- shared labels ----------
export const REASON_LABELS: Record<string, string> = {
  spam: "Spam / scam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  creator_credit: "Creator credit",
  off_topic: "Off-topic",
  hate: "Hate",
  violence: "Violence",
  self_harm: "Self-harm",
  other: "Other",
};

export const TARGET_LABELS: Record<TargetType, string> = { post: "Feed post", comment: "Comment", message: "Chat message", profile: "Member report" };
