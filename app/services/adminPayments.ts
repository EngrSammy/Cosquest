// ==========================================
// SUPER ADMIN DASHBOARD - Tickets & Payments, Check-in
// ==========================================
import { type Person, adminRequest } from "./admin";
import type { Paged } from "./adminContent";

export type Money = { amount: number; currency: string };
export type AdminTicketType = {
  id: string;
  name: string;
  description: string;
  price: Money;
  free: boolean;
  quantity: number;
  remaining: number;
  sold: number;
  held: number;
  active: boolean;
  isDefault: boolean;
  onSale: boolean;
};
export type AdminOrder = {
  id: string;
  number: string;
  status: "pending" | "paid" | "free" | "expired" | "failed" | "refunded" | "cancelled";
  amount: Money;
  user: Person | null;
  quest: { id: string; title?: string; startsAt?: string };
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  createdAt: string;
  stripe: { checkoutSessionId: string | null; paymentIntentId: string | null; refundId: string | null };
};

const qs = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && query.set(k, String(v)));
  const text = query.toString();
  return text ? `?${text}` : "";
};

export const getTicketTypes = (questId: string) => adminRequest<{ ticketTypes: AdminTicketType[]; paymentsConfigured: boolean }>(`/quests/${questId}/ticket-types`);
export const createTicketType = (questId: string, body: { name: string; description?: string; price: { amount: number }; quantity: number }) =>
  adminRequest<{ ticketType: AdminTicketType; auditEvent: string }>(`/quests/${questId}/ticket-types`, { method: "POST", body });
export const updateTicketType = (id: string, body: Partial<{ name: string; quantity: number; price: { amount: number }; active: boolean }>) =>
  adminRequest<{ ticketType: AdminTicketType; auditEvent: string }>(`/ticket-types/${id}`, { method: "PATCH", body });
export const getCheckins = (questId: string) => adminRequest<{ checkedIn: number; tickets: number }>(`/quests/${questId}/checkins`);

export const getPaymentStats = () =>
  adminRequest<{ gross: number; refunded: number; net: number; paidOrders: number; refundedOrders: number; freeTickets: number; ticketsIssued: number; pendingCheckouts: number; paymentsConfigured: boolean; mode: "test" | "live"; currency: string }>(
    "/payments/stats",
  );
export const listOrders = (params: { status?: string; quest?: string; q?: string; offset?: number }) => adminRequest<Paged<{ orders: AdminOrder[] }>>(`/orders${qs(params)}`);
export const getOrder = (id: string) =>
  adminRequest<{ order: AdminOrder & { email: string | null; ticketType: string | null; history: { at: string; event: string; detail: string }[] }; ticket: { id: string; status: string; checkedInAt: string | null } | null; stripeDashboard: string | null }>(
    `/orders/${id}`,
  );
export const refundOrder = (id: string, reason: string) => adminRequest<{ order: { status: string }; auditEvent: string }>(`/orders/${id}/refund`, { method: "POST", body: { reason } });

export type CheckinResult = { checkedIn: true; checkedInAt: string; person: Person | null; quest: { id: string; title: string } | null };
export async function checkIn(code: string, questId?: string): Promise<{ ok: true; result: CheckinResult } | { ok: false; error: string; code?: string; person?: Person | null; checkedInAt?: string }> {
  try {
    const result = await adminRequest<CheckinResult>("/checkin", { method: "POST", body: { code, ...(questId ? { questId } : {}) } });
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Couldn't check in.", code: e?.code };
  }
}

export const money = (m?: Money | null) =>
  !m || !m.amount ? "Free" : new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency || "USD", maximumFractionDigits: m.amount % 1 ? 2 : 0 }).format(m.amount);
