// Stripe for the app's payment sheet (card, Google Pay). The publishable key
// (pk_test_... / pk_live_...) is public by design; the secret one stays on
// the server. Without a key, the app falls back to Stripe's page.
import { StripeProvider } from "@stripe/stripe-react-native";
import type { ReactNode } from "react";

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

export default function StripeRoot({ children }: { children: ReactNode }) {
  if (!STRIPE_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.dammy0227.cosquest" urlScheme="cosquest">
      <>{children}</>
    </StripeProvider>
  );
}
