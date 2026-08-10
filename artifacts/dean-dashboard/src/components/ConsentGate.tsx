/**
 * One-time click-through agreement to the Terms of Service / Privacy Policy
 * for anyone using a real (non-public-tier) access link. Shown once per
 * browser per consent version; recorded server-side (api/log.js, kind:
 * "consent") so it doubles as an audit trail, not just a UI nag.
 */
import { useEffect, useState } from "react";
import { useTrial } from "@/data/TrialContext";

const CONSENT_VERSION = "1";
const KEY_PREFIX = "bi_consent_v1_";

function hasConsented(client: string): boolean {
  try { return localStorage.getItem(KEY_PREFIX + client) === CONSENT_VERSION; } catch { return false; }
}
function markConsented(client: string) {
  try { localStorage.setItem(KEY_PREFIX + client, CONSENT_VERSION); } catch { /* ignore */ }
}

export default function ConsentGate() {
  const { status, client } = useTrial();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "valid" && client && !hasConsented(client)) setOpen(true);
  }, [status, client]);

  if (!open || !client) return null;

  const onAgree = async () => {
    setBusy(true);
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "consent" }),
      });
    } catch { /* best-effort; still unlock locally so a network blip doesn't lock someone out */ }
    markConsented(client);
    setBusy(false);
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Terms of Service and Privacy Policy">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="h-1.5 bg-[#A31F34]" />
        <div className="p-6 sm:p-7">
          <h2 className="text-lg font-bold text-foreground">Before you continue</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Your firm has been given access to Baton Index. Using this data — including searches
            and candidate lists you build here — is governed by our{" "}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-[#011F5B] font-semibold underline underline-offset-2 hover:opacity-80">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-[#011F5B] font-semibold underline underline-offset-2 hover:opacity-80">
              Privacy Policy
            </a>.
          </p>
          <label className="flex items-start gap-2 mt-4 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600"
            />
            <span>I have read and agree to the Terms of Service and Privacy Policy.</span>
          </label>
          <button
            onClick={onAgree}
            disabled={!agree || busy}
            className="mt-5 w-full px-4 py-2.5 rounded-lg bg-gradient-to-b from-[#0a2a63] to-[#01143f] text-white text-sm font-semibold shadow-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "…" : "Agree & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
