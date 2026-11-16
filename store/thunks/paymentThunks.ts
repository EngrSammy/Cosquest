// Paying on the CosQuest website (services/payments.ts).
//   The app:      checkEligibility, openWebCheckout (link -> browser)
//   The website:  redeemCheckout (the link, once), payNow (Stripe's page),
//                 loadReturnOrder (the return page)
// The website keeps its checkout pass in sessionStorage too, because Stripe's
// page is a full page change: the return page reloads the app from scratch.
import { createAsyncThunk } from "@reduxjs/toolkit";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { type Eligibility, getCheckoutOrder, getEligibility, redeemCheckoutLink, requestCheckoutLink, startWebCheckout } from "@/services/payments";
import { TicketError } from "@/services/tickets";

import type { RootState } from "../store";

const PASS_KEY = "cq_checkout_pass";

type SavedPass = { token: string; expiresAt: string; questId: string };

export function savedPass(): SavedPass | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PASS_KEY) || "null") as SavedPass | null;
    return saved && new Date(saved.expiresAt).getTime() > Date.now() ? saved : null;
  } catch {
    return null;
  }
}

function savePass(pass: SavedPass | null) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    if (pass) window.sessionStorage.setItem(PASS_KEY, JSON.stringify(pass));
    else window.sessionStorage.removeItem(PASS_KEY);
  } catch {}
}

const problem = (e: unknown) => {
  const err = e as TicketError;
  return { message: err?.message || "Something went wrong. Please try again.", code: err?.code || null, data: err?.data || null };
};

// ---------- the app ----------

export const checkEligibility = createAsyncThunk<Eligibility, { questId: string; token: string }, { rejectValue: ReturnType<typeof problem> }>(
  "payment/checkEligibility",
  async ({ questId, token }, { rejectWithValue }) => {
    try {
      return await getEligibility(questId, token);
    } catch (e) {
      return rejectWithValue(problem(e));
    }
  },
);

/**
 * Pay on the website: the 20-minute link, opened in the browser (phones: an
 * in-app browser; the website: the same tab). The ticket arrives by itself
 * ("ticket:issued" on the socket, the push, or the next refresh).
 */
export const openWebCheckout = createAsyncThunk<{ expiresAt: string; closed: boolean }, { questId: string; ticketTypeId: string | null; token: string }, { rejectValue: ReturnType<typeof problem> }>(
  "payment/openWebCheckout",
  async ({ questId, ticketTypeId, token }, { rejectWithValue }) => {
    try {
      const link = await requestCheckoutLink(questId, ticketTypeId, token);
      if (Platform.OS === "web") {
        window.location.assign(link.url);
        return { expiresAt: link.expiresAt, closed: false };
      }
      await WebBrowser.openBrowserAsync(link.url, { dismissButtonStyle: "close", presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
      return { expiresAt: link.expiresAt, closed: true };
    } catch (e) {
      return rejectWithValue(problem(e));
    }
  },
);

// ---------- the website ----------

export const redeemCheckout = createAsyncThunk("payment/redeemCheckout", async ({ h }: { h: string }, { rejectWithValue }) => {
  try {
    const result = await redeemCheckoutLink(h);
    savePass({ token: result.checkoutToken, expiresAt: result.expiresAt, questId: result.quest.id });
    return result;
  } catch (e) {
    return rejectWithValue(problem(e));
  }
});

/** Stripe's page for the chosen ticket (a full page change; it returns to /checkout/return). */
export const payNow = createAsyncThunk<{ orderId: string; ticketId: string | null }, { position?: { lat: number; lng: number; accuracy: number } | null } | undefined, { state: RootState; rejectValue: ReturnType<typeof problem> }>(
  "payment/payNow",
  async (arg, { getState, rejectWithValue }) => {
    const web = getState().payment.web;
    const pass = web.checkoutToken || savedPass()?.token;
    if (!pass) return rejectWithValue({ message: "This checkout has expired. Go back to CosQuest and tap Pay again.", code: "checkout_expired", data: null });
    try {
      const result = await startWebCheckout(pass, web.selectedTicketTypeId, arg?.position || null);
      if (result.checkoutUrl && Platform.OS === "web") window.location.assign(result.checkoutUrl);
      return { orderId: result.order.id, ticketId: result.ticket?.id || null };
    } catch (e) {
      return rejectWithValue(problem(e));
    }
  },
);

/** The return page: where the order stands (asks Stripe if the webhook is late). */
export const loadReturnOrder = createAsyncThunk("payment/loadReturnOrder", async ({ orderId }: { orderId: string }, { rejectWithValue }) => {
  const pass = savedPass();
  if (!pass) return rejectWithValue({ message: "This checkout has expired. If you paid, your ticket is in My tickets in CosQuest.", code: "checkout_expired", data: null });
  try {
    const { order } = await getCheckoutOrder(pass.token, orderId);
    if (order.status === "paid" || order.status === "free") savePass(null);
    return order;
  } catch (e) {
    return rejectWithValue(problem(e));
  }
});
