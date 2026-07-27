/**
 * Insights — gated research-brief downloads that signal Baton Index's analytical
 * depth to search professionals. One email unlocks every brief. The email step is
 * a soft marketing gate (lead capture), not access control: it POSTs to
 * /api/insights-lead and fails open on network error so a demo never dead-ends.
 * The unlock is remembered in localStorage so return visits skip straight to the
 * downloads.
 */
import { useState } from "react";

type Report = {
  id: string;
  title: string;
  subtitle: string;
  cover: string;
  pdf: string;
  pages: number;
  findings: string[];
};

const REPORTS: Report[] = [
  {
    id: "law-pipeline",
    title: "The Law School Dean Pipeline",
    subtitle:
      "Where R1 law deans come from, and how a search can focus on the right channel. A read on 1,010 dean appointments across R1 law schools, 94 sitting.",
    cover: "/insights/cover-law-pipeline.png",
    pdf: "/insights/baton-law-dean-pipeline-brief.pdf",
    pages: 2,
    findings: [
      "The decanal ladder is the channel: 50% of sitting deans rose straight from an associate or vice dean chair; 99% come from legal academia, not practice or the bench.",
      "The market tilted external and diversified fast: external hires went from 8% (pre-1980) to 71% in the 2020s; women from 3% to 53% of new deans.",
      "The T14 credential funnel is real but a trap: 64% hold a top-14 law degree, Harvard and Yale over a quarter of those. Use pedigree as a tiebreak, not a gate.",
    ],
  },
  {
    id: "grad-pipeline",
    title: "The Graduate College Dean Pipeline",
    subtitle:
      "A provost-track office that turns over fast, draws from every discipline, and sits near gender parity. 156 central graduate-school heads at US public research universities.",
    cover: "/insights/cover-grad-pipeline.png",
    pdf: "/insights/baton-graduate-college-pipeline-brief.pdf",
    pages: 2,
    findings: [
      "It is a provost office, not a college deanship: about 56% carry a Vice Provost or Associate Provost title. Screen it like a provost search.",
      "The seat turns over fast: about 64% of current heads were appointed since 2023, and roughly 13% are interim right now, the most churn-heavy line we track.",
      "The pool is discipline-agnostic and near gender parity (about 49% women), because the office spans every graduate program rather than one field.",
    ],
  },
  {
    id: "discipline",
    title: "The Discipline Behind the Dean",
    subtitle:
      "Who actually leads America's research business schools — and how the path to the corner office is changing. A census of 795 R1 dean appointments, 1990–2025.",
    cover: "/insights/cover-discipline.png",
    pdf: "/insights/baton-dean-discipline-brief.pdf",
    pages: 10,
    findings: [
      "Operations management is the most over-represented discipline in the deanship (1.38×).",
      "Interim seats skew operational; deans are increasingly grown from within.",
      "The gender gap is discipline-specific — starkest in operations (0.38 promotion ratio).",
    ],
  },
  {
    id: "gender",
    title: "Gendered Pathways in Academic Leadership",
    subtitle:
      "How gender shapes who reaches the business school deanship — and where the pipeline still stalls. Drawn from the same 795-appointment R1 census.",
    cover: "/insights/cover-gender.png",
    pdf: "/insights/baton-gendered-pathways-brief.pdf",
    pages: 10,
    findings: [
      "Women's share of the deanship rose from 1.2% to 31.4% — but unevenly by discipline.",
      "Female access ranges from 28% in strategy to just 6.5% in operations.",
      "The shortfall is a leaky pipeline upstream, compounded by an interim trap.",
    ],
  },
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
      if (r.ok) unlock();
      else if (r.status === 400) setErr("That email didn't look valid — mind checking it?");
      else unlock(); // soft gate: don't block on server hiccups
    } catch {
      unlock(); // fail open on network error
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto py-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A31F34]">
        Baton Index Research
      </div>
      <h2 className="text-2xl font-bold text-foreground mt-1 leading-tight">Research briefs</h2>
      <p className="text-muted-foreground mt-1.5 leading-relaxed text-sm">
        Data-backed findings on academic leadership, drawn from our census of 10,000+ leaders — written for
        search committees and recruiters. One email unlocks every brief.
      </p>

      {/* Single gate */}
      {!unlocked && (
        <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5">
          <div className="text-sm font-semibold text-foreground">Unlock both briefs</div>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Tell us where to say thanks — we'll open every report below instantly.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@firm.com" aria-label="Work email"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#A31F34]/40"
            />
            <input
              type="text" value={org} onChange={(e) => setOrg(e.target.value)}
              placeholder="Firm (optional)" aria-label="Firm"
              className="sm:w-40 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#A31F34]/40"
            />
            <button
              type="submit" disabled={busy}
              className="rounded-lg bg-[#A31F34] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#8c1a2c] transition-colors disabled:opacity-60"
            >
              {busy ? "Unlocking…" : "Unlock reports"}
            </button>
          </div>
          {err && <p className="text-xs text-[#A31F34] mt-2">{err}</p>}
          <p className="text-[11px] text-muted-foreground mt-2">
            No list-spam. We'll only reach out about Baton Index.
          </p>
        </form>
      )}

      {/* Report cards */}
      <div className="mt-5 space-y-4">
        {REPORTS.map((r) => (
          <div
            key={r.id}
            className="flex flex-col sm:flex-row gap-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-card p-4"
          >
            <a
              href={unlocked ? r.pdf : undefined}
              target="_blank" rel="noopener noreferrer"
              className={unlocked ? "block group shrink-0 self-center sm:self-start" : "block shrink-0 self-center sm:self-start pointer-events-none"}
            >
              <img
                src={r.cover}
                alt={`${r.title} — report cover`}
                className="w-[150px] rounded-md border border-slate-200 dark:border-slate-700 shadow-md transition-transform group-hover:-translate-y-0.5"
              />
            </a>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground leading-snug">{r.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{r.subtitle}</p>
              <ul className="mt-3 space-y-1.5">
                {r.findings.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-foreground/90 leading-snug">
                    <span className="text-[#A31F34] mt-0.5 shrink-0" aria-hidden>▪</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {unlocked ? (
                  <a
                    href={r.pdf} download
                    className="inline-flex items-center gap-2 rounded-lg bg-[#A31F34] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#8c1a2c] transition-colors"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" />
                    </svg>
                    Download PDF
                    <span className="font-normal text-white/75">· {r.pages} pp</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    Enter your email above to unlock
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {unlocked && (
        <p className="text-[11px] text-muted-foreground mt-4">
          Want the underlying benchmarks for a specific school, discipline, or region — or a co-branded edition
          for a client? Use the Contact link in the top bar.
        </p>
      )}
    </div>
  );
}
