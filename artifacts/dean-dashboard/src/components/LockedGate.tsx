import { useState } from "react";
import { useTrial } from "@/data/TrialContext";
import corpusStats from "@/data/corpus-stats.json";

const CORPUS = corpusStats as { appts: number; sitting: number; roster: number; schools: number; indices: number; from: number };
const CONTACT = "ren@bu.edu";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F6F8FB] to-[#E7EBF2] text-foreground flex flex-col">
      <div className="border-t-2 border-t-[#A31F34]" />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <img src="/logo.svg" alt="BatonIndex" width={72} height={72} className="h-18 w-18 mb-4" />
            <p
              className="text-[22px] leading-tight text-[#011F5B] mb-6"
              style={{ fontFamily: "'EB Garamond', Garamond, Georgia, serif", fontWeight: 500 }}
            >
              Leadership succession data for higher education
            </p>
          </div>
          {children}
          <p className="mt-6 text-center text-xs text-muted-foreground tabular-nums">
            {CORPUS.appts.toLocaleString()} appointments · {CORPUS.sitting.toLocaleString()} sitting leaders ·{" "}
            {CORPUS.schools.toLocaleString()} schools · {CORPUS.from}–2026
          </p>
        </div>
      </div>
    </div>
  );
}

/** No / invalid token: the app is gated behind an access code. */
export function LockedLanding() {
  const { submitToken, status } = useTrial();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    await submitToken(value);
    setBusy(false);
    setTried(true);
  };
  // If we're back here after a submit, the pasted code didn't check out.
  const rejected = tried && (status === "none" || status === "invalid");

  return (
    <Shell>
      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <h1 className="text-lg font-bold">Private preview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          BatonIndex is shared with selected search firms under a pilot. Enter the access
          code from your invitation to continue.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-2">
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setTried(false); }}
            placeholder="Paste your access code or link"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
          />
          {rejected && (
            <p className="text-xs text-[#b02a3f]">That code isn’t valid or has expired. Check the link in your invitation, or get in touch.</p>
          )}
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-b from-[#0a2a63] to-[#01143f] text-white text-sm font-semibold shadow-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Checking…" : "Unlock access"}
          </button>
        </form>
        <p className="text-xs text-muted-foreground mt-4">
          Don’t have a code?{" "}
          <a href={`mailto:${CONTACT}?subject=Baton%20Index%20access`} className="text-[#011F5B] font-medium underline underline-offset-2 hover:opacity-80">
            Request access
          </a>
        </p>
      </div>
    </Shell>
  );
}

/** Expired token: end-of-trial screen naming the date. */
export function ExpiredScreen() {
  const { expiry, client } = useTrial();
  const dateStr = expiry
    ? new Date(expiry * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  return (
    <Shell>
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 text-center">
        <h1 className="text-lg font-bold">Your preview has ended</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {client ? <>The pilot for <span className="font-medium text-foreground">{client}</span> </> : <>Your pilot access </>}
          {dateStr ? <>ended on <span className="font-medium text-foreground">{dateStr}</span>.</> : <>has ended.</>}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          To extend access or discuss the full dataset, get in touch.
        </p>
        <a
          href={`mailto:${CONTACT}?subject=Baton%20Index%20renewal`}
          className="inline-block mt-4 px-4 py-2.5 rounded-lg bg-gradient-to-b from-[#b02a3f] to-[#8a1a2d] text-white text-sm font-semibold shadow-sm hover:brightness-110"
        >
          Contact us
        </a>
      </div>
    </Shell>
  );
}
