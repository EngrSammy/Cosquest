// ==========================================
// SUPER ADMIN DASHBOARD - Sparks (Phase 4, read-only)
// ==========================================
// Backend: /api/admin/sparks (cosquest-admin-backend-phase4). Never DMs.
import { type Person, adminRequest } from "./admin";
import type { Paged } from "./adminContent";

export type TopicState = "active" | "quiet" | "dormant";

export type AdminSpark = {
  id: string;
  subject: string;
  chat: { id: string; type: string | null; name: string };
  creator: Person | null;
  startedByBot: boolean;
  state: TopicState;
  moduleState: string;
  pinned: boolean;
  revivals: number;
  replies: number;
  participants: number;
  summary: string;
  createdAt: string;
  lastMessageAt: string;
};

export type SparkDetail = {
  spark: AdminSpark;
  openReports: number;
  revivals: { index: number; startedAt: string; endedAt: string | null }[];
  history: { id: string; sender: Person | null; text: string | null; deleted: boolean; era: number; at: string }[];
  related: AdminSpark[];
};

const qs = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && query.set(k, String(v)));
  const text = query.toString();
  return text ? `?${text}` : "";
};

export const getSparkStats = () => adminRequest<{ newThisWeek: number; active: number; quiet: number; dormant: number; total: number }>("/sparks/stats");
export const listSparks = (params: { tab?: string; group?: string; q?: string; offset?: number }) => adminRequest<Paged<{ sparks: AdminSpark[] }>>(`/sparks${qs(params)}`);
export const getSpark = (id: string) => adminRequest<SparkDetail>(`/sparks/${encodeURIComponent(id)}`);
