// Website: no payment sheet; Stripe's page is used.
export type PayResult = { status: "paid" } | { status: "canceled" } | { status: "failed"; message: string };

export function usePayInApp(): null {
  return null;
}
