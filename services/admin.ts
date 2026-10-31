// ==========================================
// SUPER ADMIN DASHBOARD - API and session (website only)
// ==========================================
// The dashboard has its own session (backend: /api/admin/auth/*), separate
// from the app's login, so opening it never signs a super admin's phone out.
// Its token is kept in this browser only (localStorage), and only works on
// /api/admin. 401 "admin_signin" -> the session ended: back to the sign-in page.
import { useSyncExternalStore } from "react";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const STORAGE_KEY = "cq_admin_session";

export type AdminUser = {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  avatarKey: string | null;
  avatarPhotoUrl: string | null;
  role: "super_admin";
  adminSince: string | null;
};

export type AdminSession = { token: string; admin: AdminUser };

export class AdminError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- the session (this browser) ----------
function load(): AdminSession | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

let session: AdminSession | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function save(next: AdminSession | null) {
  session = next;
  try {
    if (typeof window !== "undefined") {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  emit();
}

export function useAdminSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
    () => session,
  );
}

export function clearAdminSession() {
  save(null);
}

// ---------- requests ----------
async function request<T>(path: string, { method = "GET", body, token }: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  if (!BASE_URL) throw new AdminError("EXPO_PUBLIC_API_URL is not configured.", 0);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminError("Couldn't reach the server. Check your connection.", 0, "offline");
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || data?.message || "Something went wrong. Please try again.";
    // Not deployed yet: Express answers "Route not found".
    const code = data?.code || (response.status === 404 && /route not found/i.test(message) ? "not_deployed" : undefined);
    throw new AdminError(message, response.status, code);
  }
  return data as T;
}

/** A dashboard request with the admin session; an ended session signs out here. */
export async function adminRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await request<T>(`/api/admin${path}`, { ...options, token: session?.token });
  } catch (error) {
    if (error instanceof AdminError && (error.code === "admin_signin" || error.code === "not_admin")) save(null);
    throw error;
  }
}

// ---------- signing in and out ----------
export async function signInWithPassword(email: string, password: string) {
  const result = await request<AdminSession>("/api/admin/auth/login", { method: "POST", body: { email, password } });
  save(result);
  return result;
}

/** Signed in to CosQuest on this website already: use that account. */
export async function signInWithAppSession(appToken: string) {
  const result = await request<AdminSession>("/api/admin/auth/exchange", { method: "POST", token: appToken });
  save(result);
  return result;
}

export async function signOutAdmin() {
  try {
    await adminRequest("/auth/logout", { method: "POST" });
  } catch {}
  save(null);
}

/** Is the saved session still good? (Signs out here when it isn't.) */
export async function checkAdminSession() {
  if (!session) return null;
  try {
    const { admin } = await adminRequest<{ admin: AdminUser }>("/auth/me");
    save({ token: session.token, admin });
    return admin;
  } catch (error) {
    if (error instanceof AdminError && error.status === 401) save(null);
    return session ? session.admin : null;
  }
}

// ---------- Overview ----------
export type Person = { id: string; username: string | null; name: string; avatarKey: string | null; avatarPhotoUrl: string | null };
export type Point = { date: string; value: number };

export type ReportPreview = {
  id: string;
  number: string;
  targetType: "post" | "comment" | "message" | "profile";
  reason: string;
  priority: "high" | "standard";
  status: "new" | "in_review" | "resolved" | "dismissed";
  reporterCount: number;
  snapshot: any;
  targetUser: Person | null;
  createdAt: string;
};

export type AuditItem = {
  id: string;
  number: string;
  action: string;
  area: string;
  actor: Partial<Person> & { id: string };
  target: { type: string | null; id: string | null; label: string | null };
  reason: string;
  createdAt: string;
};

export type Overview = {
  window: { from: string; to: string };
  stats: {
    activeMembers: { value: number; change: number | null };
    interactions: { value: number; change: number | null; series: Point[] };
    activeGroups: { value: number; newThisPeriod: number; total: number };
    openReports: { value: number; high: number; new: number; inReview: number; series: Point[] };
  };
  engagement: { current: { date: string; interactions: number }[]; previous: { date: string; interactions: number }[] };
  pulse: {
    feedPosts: number;
    chatMessages: number;
    newSparks: number | null;
    mix: { reactions: number; comments: number; replies: number; total: number };
    newMembers: { value: number; change: number | null };
  };
  queue: ReportPreview[];
  recentActivity: AuditItem[];
  activeGroups: { id: string; name: string; kind: string; photoUrl: string | null; members: number; messages: number; openReports: number }[];
};

export function getOverview(range?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (range?.from) query.set("from", range.from);
  if (range?.to) query.set("to", range.to);
  const suffix = query.toString() ? `?${query}` : "";
  return adminRequest<Overview>(`/overview${suffix}`);
}
