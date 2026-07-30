/**
 * Free-tier metering + paywall (v1, client-side).
 *
 * Anonymous visitors get the R1 Business index free, up to a daily quota of
 * leader/school views (per browser, 24h rolling window). A bottom-right counter
 * gives advance notice; crossing the quota raises the day-pass paywall, which
 * links to the Stripe checkout for a 24-hour all-access pass.
 *
 * This is a soft gate: the count lives in localStorage, so it resets in a new
 * browser/incognito. True per-IP enforcement + automatic pass issuance after
 * payment (Stripe webhook -> minted 24h token) is the planned v2. Owners and any
 * valid-token holder (trial or day pass) are never metered.
 */
import { useState, useEffect, useCallback } from "react";
import { useTrial } from "@/data/TrialContext";

const LIMIT = 50;
const WINDOW_MS = 24 * 3600 * 1000;
const KEY = "bi_free_meter";
const CONTACT = "ren@bu.edu";

// One simple paid option for now: a $99 day pass that unlocks a 3-index taster
// (scope enforced server-side in api/data.js). Everything beyond that — all 12
// indices, firm plans — is a "Contact us" conversation while we validate demand.
const DAY_PASS_URL = "https://buy.stripe.com/dRm3cn69N8pc5Sa2FWebu01";
const PASSES = [
  { key: "day", name: "Day Pass", price: "$99", unit: "24 hours", blurb: "R1 Business, Presidents & Provost", url: DAY_PASS_URL, featured: true },
];

type MeterState = { start: number; count: number };

function loadMeter(): MeterState {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "null");
    if (m && typeof m.start === "number" && typeof m.count === "number" && Date.now() - m.start < WINDOW_MS) return m;
  } catch { /* ignore */ }
  return { start: Date.now(), count: 0 };
}

export interface FreeMeter {
  metered: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetInMs: number;
  paywallOpen: boolean;
  /** Record a view; returns false (and opens the paywall) when over quota. */
  tryView: () => boolean;
  showPaywall: () => void;
  dismissPaywall: () => void;
}

export function useFreeMeter(metered: boolean): FreeMeter {
  const [m, setM] = useState<MeterState>(loadMeter);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const persist = (v: MeterState) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };

  // Roll the window if the tab has been left open past 24h.
  useEffect(() => {
    if (Date.now() - m.start >= WINDOW_MS) { const fresh = { start: Date.now(), count: 0 }; setM(fresh); persist(fresh); }
  }, [m.start]);

  const tryView = useCallback((): boolean => {
    if (!metered) return true;
    let cur = m;
    if (Date.now() - cur.start >= WINDOW_MS) cur = { start: Date.now(), count: 0 };
    if (cur.count >= LIMIT) { setPaywallOpen(true); return false; }
    const next = { start: cur.start, count: cur.count + 1 };
    setM(next); persist(next);
    return true;
  }, [metered, m]);

  return {
    metered,
    count: m.count,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - m.count),
    resetInMs: Math.max(0, WINDOW_MS - (Date.now() - m.start)),
    paywallOpen,
    tryView,
    showPaywall: () => setPaywallOpen(true),
    dismissPaywall: () => setPaywallOpen(false),
  };
}

function fmtReset(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const min = Math.round((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

/**
 * Persistent top-center free-tier banner. Stays up for the whole free session and
 * only disappears once the visitor holds a valid token (day pass / trial / owner),
 * at which point `meter.metered` is false.
 */
export function FreeTierNotice({ meter }: { meter: FreeMeter }) {
  if (!meter.metered) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 w-[min(94vw,660px)] pointer-events-none">
      <div className="pointer-events-auto rounded-full border border-slate-200 dark:border-slate-700 bg-card/95 backdrop-blur shadow-lg px-4 py-2 flex items-center justify-center gap-2 text-center">
        <span className="text-[#A31F34] shrink-0" aria-hidden>◆</span>
        <p className="text-[13px] sm:text-sm text-foreground/90 leading-snug">
          Free <b>R1 Business</b> preview — {LIMIT} leader views a day.{" "}
          <button
            onClick={meter.showPaywall}
            className="text-[#011F5B] dark:text-[#AFC4E8] font-semibold underline underline-offset-2 hover:opacity-80"
          >
            See plans to unlock all 12 indices →
          </button>
        </p>
      </div>
    </div>
  );
}

/** Persistent bottom-left usage counter (bottom-right is the Suggest-a-feature button's corner). */
export function MeterBadge({ meter }: { meter: FreeMeter }) {
  if (!meter.metered) return null;
  const low = meter.remaining <= 10;
  return (
    <button
      onClick={meter.showPaywall}
      title="Free R1 Business tier — click to see plans for all 12 indices"
      className={[
        "fixed bottom-4 left-4 z-40 rounded-full shadow-lg border px-3.5 py-2 text-xs font-semibold transition-colors",
        "flex items-center gap-2",
        low
          ? "bg-[#A31F34] text-white border-[#8c1a2c] hover:bg-[#8c1a2c]"
          : "bg-card text-foreground border-slate-200 dark:border-slate-700 hover:bg-muted",
      ].join(" ")}
    >
      <span className={low ? "text-white" : "text-[#A31F34]"} aria-hidden>●</span>
      {meter.remaining > 0
        ? <span><b>{meter.remaining}</b> free view{meter.remaining === 1 ? "" : "s"} left today</span>
        : <span>Free views used · <u>Get a day pass</u></span>}
    </button>
  );
}

/** The day-pass paywall overlay. */
export function Paywall({ meter }: { meter: FreeMeter }) {
  const { submitToken, status } = useTrial();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  if (!meter.paywallOpen) return null;

  const atLimit = meter.remaining === 0;
  const onCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    await submitToken(code);
    setBusy(false);
    setTried(true);
  };
  const rejected = tried && status !== "valid";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Get access"
      onClick={meter.dismissPaywall}
    >
      <div className="w-full max-w-lg my-8 rounded-2xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#A31F34]" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                {atLimit ? "You've reached today's free limit" : "Get a day pass"}
              </h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-xl">
                {atLimit
                  ? <>You've opened <b>{meter.limit}</b> leaders on the free <b>R1 Business</b> tier today (resets in {fmtReset(meter.resetInMs)}). Grab a day pass to keep going.</>
                  : <>The free tier covers <b>R1 Business</b>. A day pass adds <b>Presidents</b> & <b>Provost</b> — need all 12 indices? Just ask.</>}
              </p>
            </div>
            <button onClick={meter.dismissPaywall} aria-label="Close" className="text-muted-foreground hover:text-foreground text-xl leading-none px-1 shrink-0">×</button>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {PASSES.map((p) => {
              const external = !!p.url;
              const href = external
                ? p.url
                : `mailto:${CONTACT}?subject=${encodeURIComponent("BatonIndex - " + p.name)}`;
              return (
                <div
                  key={p.key}
                  className={[
                    "relative rounded-xl border p-4 flex flex-col w-full sm:w-72",
                    p.featured
                      ? "border-[#A31F34] ring-1 ring-[#A31F34]/30 bg-slate-50 dark:bg-slate-800/50"
                      : "border-slate-200 dark:border-slate-700 bg-card",
                  ].join(" ")}
                >
                  {p.featured && PASSES.length > 1 && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#A31F34] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Most popular
                    </span>
                  )}
                  <div className="text-sm font-bold text-foreground">{p.name}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-[#A31F34]">{p.price}</span>
                    <span className="text-xs text-muted-foreground">/ {p.unit}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex-1">{p.blurb}</div>
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={[
                      "mt-3 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                      p.featured
                        ? "bg-[#A31F34] text-white hover:bg-[#8c1a2c]"
                        : "border border-border text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {external ? "Get it →" : "Contact to buy"}
                  </a>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Access activates shortly after checkout — paste the access link you receive below. Need all 12 indices or a firm plan?{" "}
            <a href={`mailto:${CONTACT}?subject=${encodeURIComponent("BatonIndex - full access / firm plan")}`} className="text-[#011F5B] dark:text-[#AFC4E8] font-medium underline underline-offset-2">
              Contact us
            </a>.
          </p>

          <form onSubmit={onCode} className="mt-5 max-w-md mx-auto">
            <label className="text-xs font-semibold text-foreground">Have an access code or link?</label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="text" value={code} onChange={(e) => { setCode(e.target.value); setTried(false); }}
                placeholder="Paste your link or code" autoComplete="off" spellCheck={false}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#011F5B]/30"
              />
              <button type="submit" disabled={busy || !code.trim()} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                {busy ? "…" : "Unlock"}
              </button>
            </div>
            {rejected && <p className="text-xs text-[#A31F34] mt-1.5">That code isn't valid or has expired.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
