// Paying on the CosQuest website: what the app and the website show.
//   eligibility[questId]  can I pay for this? (age, region)
//   app                   the app's side: opening the website, waiting
//   web                   the website's checkout page (after the link is swapped)
//   returnOrder           the website's return page
//   lastIssued            the latest ticket the server confirmed ("ticket:issued"):
//                         the quest shows "You're in" (questSlice) and My tickets reloads
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Eligibility, RedeemedCheckout } from "@/services/payments";
import type { Order } from "@/services/tickets";

import { checkEligibility, loadReturnOrder, openWebCheckout, payNow, redeemCheckout } from "../thunks/paymentThunks";

type Problem = { message: string; code: string | null };
export type IssuedTicket = { orderId: string; ticketId: string; questId: string; at: number };

type PaymentState = {
  eligibility: Record<string, Eligibility & { loading?: boolean }>;
  app: { questId: string | null; status: "idle" | "opening" | "waiting" | "done" | "error"; error: Problem | null; expiresAt: string | null };
  web: {
    status: "idle" | "redeeming" | "ready" | "paying" | "error";
    error: Problem | null;
    checkoutToken: string | null;
    expiresAt: string | null;
    member: RedeemedCheckout["member"] | null;
    quest: RedeemedCheckout["quest"] | null;
    ticketTypes: RedeemedCheckout["ticketTypes"];
    selectedTicketTypeId: string | null;
    eligibility: Eligibility | null;
  };
  returnOrder: { status: "idle" | "loading" | "ready" | "error"; order: Order | null; error: Problem | null };
  lastIssued: IssuedTicket | null;
};

const initialState: PaymentState = {
  eligibility: {},
  app: { questId: null, status: "idle", error: null, expiresAt: null },
  web: { status: "idle", error: null, checkoutToken: null, expiresAt: null, member: null, quest: null, ticketTypes: [], selectedTicketTypeId: null, eligibility: null },
  returnOrder: { status: "idle", order: null, error: null },
  lastIssued: null,
};

const asProblem = (payload: any, fallback: string): Problem => ({ message: payload?.message || fallback, code: payload?.code || null });

const paymentSlice = createSlice({
  name: "payment",
  initialState,
  reducers: {
    /** The server confirmed a ticket (socket "ticket:issued"). */
    ticketIssued(state, action: PayloadAction<{ orderId: string; ticketId: string; questId: string }>) {
      state.lastIssued = { ...action.payload, at: Date.now() };
      if (state.app.questId === action.payload.questId) state.app.status = "done";
    },
    chooseTicketType(state, action: PayloadAction<string>) {
      state.web.selectedTicketTypeId = action.payload;
    },
    resetAppCheckout(state) {
      state.app = initialState.app;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkEligibility.pending, (state, action) => {
        state.eligibility[action.meta.arg.questId] = { ...(state.eligibility[action.meta.arg.questId] || { allowed: true }), loading: true };
      })
      .addCase(checkEligibility.fulfilled, (state, action) => {
        state.eligibility[action.meta.arg.questId] = { ...action.payload, loading: false };
      })
      .addCase(checkEligibility.rejected, (state, action) => {
        // Couldn't ask (offline): let the person try; the server checks again before paying.
        state.eligibility[action.meta.arg.questId] = { allowed: true, loading: false };
      })

      .addCase(openWebCheckout.pending, (state, action) => {
        state.app = { questId: action.meta.arg.questId, status: "opening", error: null, expiresAt: null };
      })
      .addCase(openWebCheckout.fulfilled, (state, action) => {
        if (state.app.status !== "done") state.app.status = "waiting";
        state.app.expiresAt = action.payload.expiresAt;
      })
      .addCase(openWebCheckout.rejected, (state, action) => {
        state.app.status = "error";
        state.app.error = asProblem(action.payload, "Couldn't open the checkout. Please try again.");
        const p = action.payload as any;
        // Not allowed to pay (age, region): remember why for this quest.
        if (p?.data?.reason) state.eligibility[action.meta.arg.questId] = { allowed: false, reason: p.data.reason, code: p.code, message: p.message };
      })

      .addCase(redeemCheckout.pending, (state) => {
        state.web = { ...initialState.web, status: "redeeming" };
      })
      .addCase(redeemCheckout.fulfilled, (state, action) => {
        const r = action.payload;
        const onSale = r.ticketTypes.find((t) => t.onSale);
        state.web = {
          status: "ready",
          error: null,
          checkoutToken: r.checkoutToken,
          expiresAt: r.expiresAt,
          member: r.member,
          quest: r.quest,
          ticketTypes: r.ticketTypes,
          selectedTicketTypeId: r.selectedTicketTypeId || onSale?.id || null,
          eligibility: r.eligibility,
        };
      })
      .addCase(redeemCheckout.rejected, (state, action) => {
        state.web.status = "error";
        state.web.error = asProblem(action.payload, "This checkout link isn't valid. Go back to CosQuest and tap Pay again.");
      })

      .addCase(payNow.pending, (state) => {
        state.web.status = "paying";
        state.web.error = null;
      })
      .addCase(payNow.fulfilled, (state) => {
        // Stripe's page is opening (a full page change).
        state.web.status = "paying";
      })
      .addCase(payNow.rejected, (state, action) => {
        state.web.status = "ready";
        state.web.error = asProblem(action.payload, "Couldn't start the payment. Nothing was charged. Please try again.");
      })

      .addCase(loadReturnOrder.pending, (state) => {
        state.returnOrder.status = "loading";
      })
      .addCase(loadReturnOrder.fulfilled, (state, action) => {
        state.returnOrder = { status: "ready", order: action.payload, error: null };
      })
      .addCase(loadReturnOrder.rejected, (state, action) => {
        state.returnOrder = { status: "error", order: state.returnOrder.order, error: asProblem(action.payload, "Couldn't check the payment. Please refresh.") };
      });
  },
});

export const { ticketIssued, chooseTicketType, resetAppCheckout } = paymentSlice.actions;
export default paymentSlice.reducer;
