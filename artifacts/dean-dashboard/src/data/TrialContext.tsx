import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

// Hardening Step 4 — the trial gate's visible half.
//
// On load: capture a ?k=<token> deep link into the bi_trial cookie, then ask
// /api/trial what to render. The server is the source of truth; this only decides
// UX (full app / locked / expired / scoped switcher). When TRIAL_SECRET is unset
// the endpoint reports { armed: false } and the app runs fully public — so this
// changes nothing on the live site until the gate is armed (Step 5).

export type TrialStatus = "none" | "invalid" | "expired" | "valid";
export interface TrialState {
  loading: boolean;
  armed: boolean;
  status?: TrialStatus;
  scope?: string[];
  expiry?: number;  // unix seconds
  client?: string;
}
interface TrialCtx extends TrialState {
  /** Whether a dataset id may be opened (always true when disarmed). */
  allowed: (id: string) => boolean;
  /** Paste a token or a full ?k= link to unlock; re-checks with the server. */
  submitToken: (raw: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<TrialCtx | null>(null);

/** Pull a token out of a pasted bare token or a full URL containing ?k=. */
function extractToken(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const at = s.indexOf("k=");
  if (/[?&]k=/.test(s)) {
    try { return new URL(s).searchParams.get("k") || ""; } catch { /* not a URL */ }
    return decodeURIComponent(s.slice(at + 2).split("&")[0]);
  }
  return s;
}

/** Decode a token's expiry (unix s) without verifying, to size the cookie. */
function tokenExpiry(token: string): number | null {
  try {
    const body = token.slice(0, token.indexOf("."));
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.x === "number" ? json.x : null;
  } catch { return null; }
}

function setCookie(token: string) {
  const x = tokenExpiry(token);
  const maxAge = x ? Math.max(0, x - Math.floor(Date.now() / 1000)) : 30 * 86400;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

// Dev-only override to preview the four states without arming the server:
//   ?__trial=none|invalid|valid|expired   (stripped from prod builds)
function devOverride(): TrialState | null {
  if (!import.meta.env.DEV) return null;
  const p = new URLSearchParams(location.search).get("__trial");
  if (!p) return null;
  const now = Math.floor(Date.now() / 1000);
  if (p === "valid") return { loading: false, armed: true, status: "valid", scope: ["r1bschool", "usnursing", "r1university"], expiry: now + 14 * 86400, client: "demo-firm" };
  if (p === "expired") return { loading: false, armed: true, status: "expired", expiry: now - 3 * 86400, client: "demo-firm" };
  if (p === "none" || p === "invalid") return { loading: false, armed: true, status: p };
  return null;
}

export function TrialProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrialState>(() => devOverride() || { loading: true, armed: false });

  const refresh = useCallback(async () => {
    const dev = devOverride();
    if (dev) { setState(dev); return; }
    try {
      const r = await fetch("/api/trial", { headers: { accept: "application/json" }, cache: "no-store" });
      const ct = r.headers.get("content-type") || "";
      if (!r.ok || !ct.includes("json")) { setState({ loading: false, armed: false }); return; }
      const j = await r.json();
      setState({ loading: false, armed: !!j.armed, status: j.status, scope: j.scope, expiry: j.expiry, client: j.client });
    } catch {
      // No endpoint (e.g. vite dev) or network error -> treat as disarmed/public.
      setState({ loading: false, armed: false });
    }
  }, []);

  // Capture ?k= into the cookie and clean the URL, then check status.
  useEffect(() => {
    if (devOverride()) return;
    const url = new URL(location.href);
    const k = url.searchParams.get("k");
    if (k) {
      setCookie(k);
      url.searchParams.delete("k");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    refresh();
  }, [refresh]);

  const submitToken = useCallback(async (raw: string) => {
    const token = extractToken(raw);
    if (token) setCookie(token);
    await refresh();
  }, [refresh]);

  const allowed = useCallback(
    (id: string) => !state.armed || (state.status === "valid" && !!state.scope?.includes(id)),
    [state.armed, state.status, state.scope],
  );

  return <Ctx.Provider value={{ ...state, allowed, submitToken, refresh }}>{children}</Ctx.Provider>;
}

export function useTrial(): TrialCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrial must be used within TrialProvider");
  return v;
}
