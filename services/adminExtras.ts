// ==========================================
// SUPER ADMIN DASHBOARD - Phase 6 (finishing touches)
// ==========================================
// Exports, search, the bell, triage handoff, creating a group / text post,
// contacting a group owner. Backend: cosquest-admin-backend-phase6.
import { type Person, adminRequest } from "./admin";

const qs = (params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

/** Downloads a CSV export (website), with the page's current filters. */
export async function downloadCsv(path: string, filters: Record<string, string | number | undefined | null> = {}) {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem("cq_admin_session") : null;
  const token = raw ? JSON.parse(raw).token : null;
  const { offset, ...rest } = filters;
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/admin${path}${qs(rest)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Couldn't export.");
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] || "cosquest-export.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type SearchResults = {
  members: (Person & { email: string | null })[];
  groups: { id: string; name: string; kind: string; archived: boolean }[];
  posts: { id: string; label: string; text: string; author: Person | null; removed: boolean }[];
  reports: { id: string; number: string; reason: string; status: string; text: string }[];
  sparks: { id: string; subject: string }[];
};
export const searchAdmin = (q: string) => adminRequest<SearchResults>(`/search${qs({ q })}`);

export type AlertItem = {
  id: string;
  kind: "high_priority_report" | "assigned_to_you" | "join_requests" | "admin_invitation";
  title: string;
  text: string;
  link: { page: string; report?: string; group?: string };
  at: string;
};
export const getAlerts = () => adminRequest<{ items: AlertItem[]; counts: { highPriority: number; assignedToYou: number } }>("/alerts");

export const getTriage = () => adminRequest<{ admins: (Person & { inReview: number; high: number; you: boolean })[]; unassignedHigh: number }>("/reports/triage");

export const createGroup = (body: { name: string; description: string; kind: "open" | "private"; joinMode: "instant" | "approval" }) =>
  adminRequest<{ group: { id: string; name: string }; auditEvent: string }>("/groups", { method: "POST", body });
export const contactOwner = (groupId: string, message: string) => adminRequest<{ sent: boolean; auditEvent: string }>(`/groups/${groupId}/contact-owner`, { method: "POST", body: { message } });
export const createCommunityPost = (content: string) => adminRequest<{ post: { id: string; label: string }; auditEvent: string }>("/feeds/posts", { method: "POST", body: { content } });
