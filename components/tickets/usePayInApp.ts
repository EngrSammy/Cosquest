// Pay inside the app with Stripe's payment sheet (card, Google Pay).
// Returns null where it isn't available (website, or no publishable key):
// the caller then uses Stripe's page instead.
import { useStripe } from "@stripe/stripe-react-native";
import { useCallback } from "react";

import { STRIPE_PUBLISHABLE_KEY } from "./StripeRoot";

export type PayResult = { status: "paid" } | { status: "canceled" } | { status: "failed"; message: string };

export function usePayInApp() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const pay = useCallback(
    async (clientSecret: string, currency: string, email?: string | null): Promise<PayResult> => {
      const init = await initPaymentSheet({
        merchantDisplayName: "CosQuest",
        paymentIntentClientSecret: clientSecret,
        returnURL: "cosquest://stripe-redirect",
        googlePay: { merchantCountryCode: "US", currencyCode: currency.toUpperCase(), testEnv: STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_") },
        ...(email ? { defaultBillingDetails: { email } } : {}),
      });
      if (init.error) return { status: "failed", message: init.error.message };
      const result = await presentPaymentSheet();
      if (!result.error) return { status: "paid" };
      if (result.error.code === "Canceled") return { status: "canceled" };
      return { status: "failed", message: result.error.message };
    },
    [initPaymentSheet, presentPaymentSheet],
  );
  return STRIPE_PUBLISHABLE_KEY ? pay : null;
}
