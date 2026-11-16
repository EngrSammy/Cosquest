// ==========================================
// PAYMENTS: paying on the CosQuest website (payment brief, decision 2)
// ==========================================
// No payment screens in the app. The app asks for a 20-minute link and opens
// the website; the website swaps the link (once) for a checkout-only pass and
// pays with it on Stripe's page. Paid is decided only by the server (Stripe's
// signed webhook); the app hears "ticket:issued" on its socket.
// Backend: website-checkout-backend (WEBSITE-CHECKOUT.md).
import type { Quest } from "./quests";
import { type Order, type TicketType, TicketError } from "./tickets";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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

/** Can I pay for this? reason: age | region | missing_signals. */
export type Eligibility = {
  allowed: boolean;
  reason?: "age" | "region" | "missing_signals";
  code?: string;
  message?: string;
  mode?: "test" | "live";
};

export type CheckoutLink = { url: string; expiresAt: string };

export type RedeemedCheckout = {
  checkoutToken: string;
  expiresAt: string;
  member: { name: string; username: string | null };
  quest: Quest;
  ticketTypes: TicketType[];
  selectedTicketTypeId: string | null;
  eligibility: Eligibility;
};

/** The app (logged in): the 20-minute link to the website. */
export const requestCheckoutLink = (questId: string, ticketTypeId: string | null, token: string) =>
  request<CheckoutLink>("/api/payments/handoff", { method: "POST", token, body: { questId, ...(ticketTypeId ? { ticketTypeId } : {}) } });

/** The app (logged in): can I pay for this quest? */
export const getEligibility = (questId: string, token: string) => request<Eligibility>(`/api/payments/eligibility?questId=${encodeURIComponent(questId)}`, { token });

/** The website: swap the link (once) for the checkout pass and what's being bought. */
export const redeemCheckoutLink = (h: string) => request<RedeemedCheckout>("/api/payments/handoff/redeem", { method: "POST", body: { h } });

/** The website: Stripe's page for this ticket (returns to /checkout/return). */
export const startWebCheckout = (checkoutToken: string, ticketTypeId: string | null, position?: { lat: number; lng: number; accuracy: number } | null) =>
  request<{ order: Order; checkoutUrl: string | null; ticket: { id: string } | null; reused: boolean }>("/api/payments/checkout", {
    method: "POST",
    token: checkoutToken,
    body: { ...(ticketTypeId ? { ticketTypeId } : {}), ...(position ? { position } : {}) },
  });

/** The website's return page: where the order stands (asks Stripe if still pending). */
export const getCheckoutOrder = (checkoutToken: string, orderId: string) => request<{ order: Order }>(`/api/payments/orders/${orderId}`, { token: checkoutToken });
