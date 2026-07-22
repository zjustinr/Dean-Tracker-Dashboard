/**
 * Insights — a gated research-brief download that signals Baton Index's
 * analytical depth to search professionals. The email step is a soft marketing
 * gate (lead capture), not access control: it POSTs to /api/insights-lead and
 * fails open on network error so a demo never dead-ends. Once unlocked, the
 * choice is remembered in localStorage so return visits skip straight to the
 * download.
 */
import { useState } from "react";

const REPORT = {
  title: "Gendered Pathways in Academic Leadership",
  subtitle:
    "Six data-backed findings on how gender shapes who reaches, serves in, and leaves the business school deanship.",
  cover: "/insights/cover.png",
  pdf: "/insights/baton-gendered-pathways-brief.pdf",
  pages: 10,
};

const FINDINGS = [
  "The pipeline into the deanship is sharply gendered by discipline — a 4.1× odds gap.",
  "That pipeline is reconfiguring fast: Finance/Accounting overtook Strategy for women in the 2020s.",
  "A glass cliff runs through interim roles, especially after surprise departures.",
  "The apparent gender tenure gap is entirely compositional — it vanishes with controls.",
  "The elite-PhD credential bar is rising for women: a 27.6-point gap in the 2020s.",
  "Academia leads Fortune 500 CEO diversity by roughly two decades (r = 0.85).",
];

const STATS: [string, string][] = [
  ["618", "dean appointments"],
  ["93", "top U.S. schools"],
  ["1967–2026", "six decades"],
];

const STORE_KEY = "bi_insights_unlocked";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Insights() {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem(STORE_KEY) === "1"; } catch { return false; }
  });
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function unlock() {
    setUnlocked(true);
    try { localStorage.setItem(STORE_KEY, "1"); } catch { /* ignore */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!EMAIL_RE.test(email.trim())) { setErr("Please enter a valid work email."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/insights-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), org: org.trim() }),
      });
      if (r.ok) { unlock(); }
      else if (r.status === 400) { setErr("That email didn't look valid — mind checking it?"); }
      else { unlock(); } // soft gate: don't block on server hiccups
    } catch {
      unlock(); // fail open on network error
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto py-2">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,300px)_1fr] gap-8 items-start">
        {/* Cover */}
        <div className="order-1">
          <a
            href={unlocked ? REPORT.pdf : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={unlocked ? "block group" : "block pointer-events-none"}
          >
            <img
              src={REPORT.cover}
              alt={`${REPORT.title} — report cover`}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg transition-transform group-hover:-translate-y-0.5"
            />
          </a>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {REPORT.pages}-page PDF &middot; Baton Index Research
          </p>
        </div>

        {/* Copy + gate */}
        <div className="order-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A31F34]">
            Baton Index Research
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-1 leading-tight">
            {REPORT.title}
          </h2>
          <p className="text-muted-foreground mt-2 leading-relaxed">{REPORT.subtitle}</p>

          <div className="flex flex-wrap gap-6 mt-5">
            {STATS.map(([n, l]) => (
              <div key={l}>
                <div className="text-xl font-bold text-[#A31F34]">{n}</div>
                <div className="text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>

          <ul className="mt-5 space-y-2">
            {FINDINGS.map((f) => (
              <li key={f} className="flex gap-2.5 text-sm text-foreground/90 leading-snug">
                <span className="text-[#A31F34] mt-0.5 shrink-0" aria-hidden>▪</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {/* Gate / download */}
          <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5">
            {unlocked ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-[#A31F34]" aria-hidden>✓</span> Your report is ready
                </div>
                <a
                  href={REPORT.pdf}
                  download
                  className="inline-flex items-center gap-2 mt-3 rounded-lg bg-[#A31F34] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#8c1a2c] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" />
                  </svg>
                  Download the PDF
                </a>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Want the underlying benchmarks for a specific school, discipline, or region — or a
                  co-branded edition for a client? Use the Contact link in the footer.
                </p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="text-sm font-semibold text-foreground">Get the full brief</div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Tell us where to say thanks — we'll unlock the {REPORT.pages}-page PDF instantly.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@firm.com"
                    aria-label="Work email"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#A31F34]/40"
                  />
                  <input
                    type="text"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Firm (optional)"
                    aria-label="Firm"
                    className="sm:w-40 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#A31F34]/40"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-[#A31F34] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#8c1a2c] transition-colors disabled:opacity-60"
                  >
                    {busy ? "Unlocking…" : "Unlock report"}
                  </button>
                </div>
                {err && <p className="text-xs text-[#A31F34] mt-2">{err}</p>}
                <p className="text-[11px] text-muted-foreground mt-2">
                  One report, no list-spam. We'll only reach out about Baton Index.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
