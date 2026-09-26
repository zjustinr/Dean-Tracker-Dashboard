/**
 * Stripe links for self-serve plans, in one place for the paywall, the Account
 * page and the renewal banner. All three passes cover every index (scope "*").
 *
 * An empty URL hides whatever depends on it, so a plan can ship in code before
 * its Stripe link exists.
 */

/** $49 Day Pass — one-time, 24 hours. */
export const DAY_PASS_URL = "https://buy.stripe.com/6oUfZ9bu78pccgy80gebu02";

/** $99/month Monthly Pass — Stripe Payment Link for the subscription. */
export const MONTHLY_PASS_URL = "";

/** Stripe customer-portal login link (Settings → Billing → Customer portal). */
export const BILLING_PORTAL_URL = "";

/** Monthly checkout with the buyer's email filled in, when we know it. */
export function monthlyCheckoutUrl(email?: string | null): string {
  if (!MONTHLY_PASS_URL) return "";
  return email && email.includes("@")
    ? `${MONTHLY_PASS_URL}?prefilled_email=${encodeURIComponent(email)}`
    : MONTHLY_PASS_URL;
}
