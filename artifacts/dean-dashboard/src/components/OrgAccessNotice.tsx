/**
 * Renewal banner for people who signed up through their firm (work-email signup).
 *
 * After the firm's end date there is a grace period: access continues, and this
 * says so, with the date it closes. After the grace period the person is back on
 * the free tier, and this explains why instead of leaving them to wonder. Both
 * clear on their own once the firm is renewed -- /api/trial reads the firm's
 * live end date, so nobody needs to sign in again.
 */
import { useState } from "react";
import { useTrial } from "@/data/TrialContext";
import { monthlyCheckoutUrl } from "@/config/pricing";

const CONTACT = "ren@bu.edu";
const DISMISS_KEY = "bi_org_notice_dismissed";

const fmt = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function OrgAccessNotice() {
  const { status, org, expiry, graceUntil, client } = useTrial();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  const inGrace = status === "valid" && !!org && !!graceUntil;
  const ended = status === "expired" && !!org;
  if ((!inGrace && !ended) || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };
  const mail = `mailto:${CONTACT}?subject=${encodeURIComponent(`Renew Baton Index for ${org}`)}`;
  // Offer the Monthly Pass to people whose firm plan is ending, pre-filled with
  // their email so the subscription attaches to the account they already use.
  const monthly = monthlyCheckoutUrl(client);

  return (
    <div className={`border-b ${inGrace ? "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900" : "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900"}`}>
      <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-start gap-3 text-sm">
        <p className="flex-1 text-foreground/90 leading-snug">
          {inGrace ? (
            <>{org}'s Baton Index access ended{expiry ? <> on <b>{fmt(expiry)}</b></> : null}. You still have full access until <b>{fmt(graceUntil!)}</b>.{" "}</>
          ) : (
            <>{org}'s Baton Index access has ended{expiry ? <> ({fmt(expiry)})</> : null}, so you're on the free tier. Once it's renewed, your access comes back automatically.{" "}</>
          )}
          <a href={mail} className="font-semibold text-[#011F5B] dark:text-[#AFC4E8] underline underline-offset-2 hover:opacity-80">
            Get in touch to renew
          </a>
          {monthly && (
            <>
              {" "}or{" "}
              <a href={monthly} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#A31F34] underline underline-offset-2 hover:opacity-80">
                continue on your own for $99/month
              </a>
            </>
          )}
        </p>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0">×</button>
      </div>
    </div>
  );
}
