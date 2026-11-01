// ==========================================
// TICKETS (members): ticket types, checkout, orders, My tickets
// ==========================================
// Backend: tickets-backend (TICKETS.md). Paying happens on Stripe's own page
// (Checkout); the server only marks an order paid from Stripe's signed
// webhook, so the app never decides that a payment worked - it asks.
// Errors keep the server's `code` (sold_out, has_ticket, ...).
import type { Quest } from "./quests";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export class TicketError extends Error {
  status: number;
  code?: string;
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(path: string, { method = "GET", body, token }: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
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
    throw new TicketError("No connection. Check your internet and try again - you won't be charged twice.", 0, "offline");
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok) throw new TicketError(data?.error || "Something went wrong. Please try again.", response.status, data?.code, data);
  return data as T;
}

export type Money = { amount: number; currency: string };

export type TicketType = {
  id: string;
  name: string;
  description: string;
  price: Money;
  free: boolean;
  quantity: number;
  remaining: number;
  soldOut: boolean;
  onSale: boolean;
};

export type OrderStatus = "pending" | "paid" | "free" | "expired" | "failed" | "refunded" | "cancelled";

export type Order = {
  id: string;
  number: string;
  questId: string;
  status: OrderStatus;
  amount: Money;
  checkoutUrl: string | null;
  holdExpiresAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  ticket: { id: string; status: string } | null;
};

export type MyTicket = {
  id: string;
  status: "valid" | "checked_in" | "refunded" | "cancelled";
  code?: string;
  quest: Quest | null;
  ticketType: { id: string; name: string } | null;
  order: { id: string; number: string; amount: Money; status: OrderStatus; paidAt: string | null } | null;
  checkedInAt: string | null;
  canGiveBack: boolean;
  giveBackUntil: string | null;
};

export const formatMoney = (m?: Money | null) =>
  !m || !m.amount ? "Free" : new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency || "USD", maximumFractionDigits: m.amount % 1 ? 2 : 0 }).format(m.amount);

export const getTicketTypes = (questId: string) => request<{ ticketTypes: TicketType[] }>(`/api/quests/${questId}/ticket-types`);

export const checkout = (questId: string, ticketTypeId: string | null, token: string) =>
  request<{ order: Order; checkoutUrl: string | null; ticket: { id: string } | null; reused: boolean }>(`/api/quests/${questId}/checkout`, {
    method: "POST",
    token,
    body: ticketTypeId ? { ticketTypeId } : {},
  });

export const getOrder = (orderId: string, token: string) => request<{ order: Order }>(`/api/orders/${orderId}`, { token });
export const getMyTickets = (scope: "upcoming" | "past", token: string) => request<{ tickets: MyTicket[] }>(`/api/me/tickets?scope=${scope}`, { token });
export const getMyTicket = (ticketId: string, token: string) => request<{ ticket: MyTicket }>(`/api/me/tickets/${ticketId}`, { token });
export const giveBackTicket = (ticketId: string, token: string) => request<{ refunded: boolean }>(`/api/me/tickets/${ticketId}/cancel`, { method: "POST", token });
