// Website: Stripe's own page is used (no payment sheet on the web).
import type { ReactNode } from "react";

export const STRIPE_PUBLISHABLE_KEY = "";

export default function StripeRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
