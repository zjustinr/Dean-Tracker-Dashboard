/**
 * Work-email sign-in for partner firms.
 *
 * Anyone at an allowlisted domain (managed on the owner usage page) enters their
 * email here and gets a one-time sign-in link; api/trial.js does the checking
 * and sets the access cookie. Opened by the /?join link we hand to a firm, or
 * from the paywall. After the emailed link is confirmed the server redirects
 * back with ?signup=<result>, which this also reports.
 */
import { useEffect, useState } from "react";
import { useTrial } from "@/data/TrialContext";

const CONTACT = "ren@bu.edu";

type Phase = "form" | "sent";

const RESULT_TEXT: Record<string, { title: string; body: string; ok?: boolean }> = {
  ok: { title: "You're signed in", body: "Welcome to Baton Index. Your access is tied to your work email.", ok: true },
  expired: { title: "That link has expired", body: "Sign-in links work once and last 15 minutes. Request a new one below." },
  ineligible: { title: "Access isn't available", body: "Your organization's access has ended or is paused. Get in touch if you think this is a mistake." },
  unavailable: { title: "Sign-in is temporarily unavailable", body: "Please try again in a few minutes." },
};

const ERROR_TEXT: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  not_eligible: "That email domain isn't enrolled. Use your work email, or get in touch for access.",
  rate_limited: "Too many requests. Please wait a while and try again.",
  email_failed: "We couldn't send the email just now. Please try again shortly.",
};

/** Read and strip ?join / ?signup=<result> from the URL once, on load. */
function takeUrlFlags(): { join: boolean; result: string | null } {
  const url = new URL(location.href);
  const join = url.searchParams.has("join");
  const result = url.searchParams.get("signup");
  if (join || result) {
    url.searchParams.delete("join");
    url.searchParams.delete("signup");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return { join, result };
}

export function useSignupDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    const f = takeUrlFlags();
    if (f.result && RESULT_TEXT[f.result]) { setResult(f.result); setOpen(true); }
    else if (f.join) setOpen(true);
  }, []);
  return {
    open, result,
    show: () => { setResult(null); setOpen(true); },
    close: () => setOpen(false),
  };
}

export function SignupDialog({ dialog }: { dialog: ReturnType<typeof useSignupDialog> }) {
  const { refresh } = useTrial();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The cookie was set by the redirect, so pick up the new access right away.
  useEffect(() => { if (dialog.result === "ok") refresh(); }, [dialog.result, refresh]);

  if (!dialog.open) return null;
  const outcome = dialog.result ? RESULT_TEXT[dialog.result] : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/trial?action=signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) setPhase("sent");
      else setError(ERROR_TEXT[j.error] || "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Sign in with work email"
      onClick={dialog.close}
    >
      <div className="w-full max-w-md my-16 rounded-2xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#A31F34]" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-foreground leading-tight">
              {outcome ? outcome.title : phase === "sent" ? "Check your email" : "Sign in with your work email"}
            </h2>
            <button onClick={dialog.close} aria-label="Close" className="text-muted-foreground hover:text-foreground text-xl leading-none px-1 shrink-0">×</button>
          </div>

          {outcome && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{outcome.body}</p>}

          {outcome?.ok ? (
            <button onClick={dialog.close} className="mt-5 w-full rounded-lg bg-[#A31F34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#8c1a2c]">
              Start exploring
            </button>
          ) : phase === "sent" ? (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a sign-in link to <b className="text-foreground">{email.trim()}</b>. It works once and expires in 15 minutes.
              Open it on this device to finish signing in.
            </p>
          ) : (
            <>
              {!outcome && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Partner firms get access through their work email. We'll email you a one-time sign-in link.
                </p>
              )}
              <form onSubmit={onSubmit} className="mt-4 space-y-2">
                <input
                  type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="you@yourfirm.com" autoComplete="email" autoFocus spellCheck={false}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#011F5B]/30"
                />
                {error && <p className="text-xs text-[#A31F34]">{error}</p>}
                <button
                  type="submit" disabled={busy || !email.trim()}
                  className="w-full rounded-lg bg-gradient-to-b from-[#0a2a63] to-[#01143f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? "Sending…" : "Email me a sign-in link"}
                </button>
              </form>
              <p className="text-[11px] text-muted-foreground mt-3">
                Usage is logged per account to improve the product. Firm not enrolled?{" "}
                <a href={`mailto:${CONTACT}?subject=${encodeURIComponent("Baton Index access for my firm")}`} className="text-[#011F5B] dark:text-[#AFC4E8] font-medium underline underline-offset-2">
                  Get in touch
                </a>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
