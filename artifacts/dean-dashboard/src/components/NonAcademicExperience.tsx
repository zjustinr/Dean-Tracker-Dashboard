import { useMemo, useState } from "react";
import {
  useNonAcademicExperience, usePhotoMap, enrichKey,
  type NonAcademicRecord, type TieSeniority,
} from "@/data/enrichment";
import { useDataset } from "@/data/DatasetContext";

/**
 * Non-academic Experience — the ranked view of leaders who have worked outside
 * the academy and carry a network a school could tap for gifts, partnerships,
 * executive education or placement.
 *
 * "Outside the academy" deliberately means COMPANY, GOVERNMENT, NONPROFIT,
 * FOUNDATION AND HEALTH SYSTEM alike. An earlier cut counted companies only,
 * which scored a health-system board chair, a state budget director and a
 * foundation trustee at zero — three of the strongest networks in the corpus.
 * Only Academic is the baseline, and Unclassified stays out because "no rule
 * matched" is an open question rather than a finding.
 *
 * Everything here reads from nonacademic-experience.json (a derivation over
 * recorded career stops — see scripts/gen-nonacademic-experience.mjs), and only
 * NAMED-ORGANISATION ties are listed: a person appears because a specific
 * employer at a specific rank is on their record, never because of a bare flag. The
 * ranking is the tie score computed at generation time (seniority-dominant,
 * recency-decayed, board/advisory weighted above plain past employment); the
 * weights ship inside the file so the "How the ranking works" panel below
 * always describes the numbers actually shown.
 *
 * Coverage honesty is load-bearing: roughly half the corpus has no career
 * evidence either way, so this view says who IS known to carry a tie and
 * never implies anything about who isn't listed. Counts are computed from the
 * people actually received — the server scope-gates the map for trial/public
 * visitors, so reading the corpus-wide `counts` block would overstate what
 * this visitor can see.
 */

const SENIORITY_ORDER: TieSeniority[] = ["executive", "senior", "professional", "unknown"];
const SENIORITY_LABEL: Record<TieSeniority, string> = {
  executive: "Executive", senior: "Senior", professional: "Professional", unknown: "Rank unknown",
};
const SENIORITY_CLS: Record<TieSeniority, string> = {
  executive: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  senior: "bg-sky-600/15 text-sky-800 dark:text-sky-300",
  professional: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  unknown: "bg-slate-400/10 text-muted-foreground",
};

const PAGE_SIZE = 60;

type Entry = { key: string; rec: NonAcademicRecord };

export default function NonAcademicExperience({ onOpenLeader }: {
  onOpenLeader?: (index: string | null, fullName: string) => void;
}) {
  const doc = useNonAcademicExperience();
  const photos = usePhotoMap();
  const { list } = useDataset();
  const indexLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of list) m.set(d.id, d.shortLabel ?? d.label ?? d.id);
    return m;
  }, [list]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [seniorities, setSeniorities] = useState<Set<TieSeniority>>(new Set());
  const [sittingOnly, setSittingOnly] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showMethod, setShowMethod] = useState(false);

  // Only named-firm ("high" confidence) records ever enter the pool — a
  // flag-only yes has no employer to show and nothing honest to rank on.
  const pool = useMemo<Entry[]>(() => {
    if (!doc) return [];
    const out: Entry[] = [];
    for (const key in doc.people) {
      const rec = doc.people[key];
      if (rec.status === "yes" && rec.confidence === "high" && rec.ties?.length) out.push({ key, rec });
    }
    out.sort((a, b) =>
      (b.rec.score ?? 0) - (a.rec.score ?? 0) ||
      SENIORITY_ORDER.indexOf(a.rec.seniority ?? "unknown") - SENIORITY_ORDER.indexOf(b.rec.seniority ?? "unknown") ||
      a.rec.name.localeCompare(b.rec.name));
    return out;
  }, [doc]);

  const categoryOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const { rec } of pool) for (const i of rec.categories ?? []) c.set(i, (c.get(i) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter(({ rec }) => {
      if (sittingOnly && !rec.sitting) return false;
      if (category !== "all" && !(rec.categories ?? []).includes(category)) return false;
      if (seniorities.size && !seniorities.has(rec.seniority ?? "unknown")) return false;
      if (q) {
        const hay = `${rec.name} ${rec.university} ${(rec.firms ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pool, query, category, seniorities, sittingOnly]);

  const sittingCount = useMemo(() => pool.filter((e) => e.rec.sitting).length, [pool]);

  const toggleSeniority = (s: TieSeniority) => {
    setSeniorities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
    setVisible(PAGE_SIZE);
  };

  if (!doc) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-sm text-muted-foreground">
        Loading non-academic experience data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + coverage framing */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Non-academic Experience</h2>
          <span className="text-xs text-muted-foreground">
            {sittingCount} sitting leader{sittingCount === 1 ? "" : "s"} with a named organisation
            {pool.length > sittingCount ? ` · ${pool.length} incl. past leaders` : ""} · as of {doc.asOf}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl">
          Leaders whose record names a specific organisation outside the academy — a company,
          government body, nonprofit, foundation or health system — ranked by how senior they were
          there, how recent the tie is, and how they were attached (employment, board seat, advisory
          role). The organisation is the asset; use this to find who can open a door.
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
          <span className="font-semibold">Coverage note:</span> derived from recorded career stops.
          Roughly half the corpus has no career evidence either way, so absence from this list is
          <span className="italic"> not</span> evidence of no non-academic background.
        </p>
        <button
          onClick={() => setShowMethod((v) => !v)}
          className="text-xs text-primary hover:underline mt-2"
        >
          {showMethod ? "Hide" : "How the ranking works"}
        </button>
        {showMethod && (
          <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 max-w-3xl space-y-1">
            <p>
              A person's score is their <span className="font-semibold">best single tie</span>, not a sum —
              one executive seat opens more doors than four junior stints. Each tie scores additively:
            </p>
            <p>
              Seniority: executive {doc.scoring.seniority.executive} · senior {doc.scoring.seniority.senior} ·
              professional {doc.scoring.seniority.professional} · unknown {doc.scoring.seniority.unknown}.{" "}
              Attachment: board +{doc.scoring.kind.board} · advisory +{doc.scoring.kind.advisory} · employment +{doc.scoring.kind.employment}.{" "}
              Recency: {doc.scoring.recency} (years since the tie ended, vs. {doc.asOf}).
            </p>
            <p>
              Seniority and attachment come from the recorded role title; recency from recorded years, or
              the appointment year that ended the job. Weights ship inside the data file itself, so this
              panel always describes the ranking actually shown. Sector is deliberately <span className="font-semibold">not</span> a
              scoring input — a foundation seat and a corporate one are ranked on the same axes, and the
              category filter above is there for anyone who wants to weigh them differently.
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
            placeholder="Search name, university, or organisation…"
            className="flex-1 min-w-[220px] px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setVisible(PAGE_SIZE); }}
            className="px-2 py-1.5 text-sm rounded-md border border-border bg-background"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categoryOptions.map(([name, n]) => (
              <option key={name} value={name}>{name} ({n})</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sittingOnly}
              onChange={(e) => { setSittingOnly(e.target.checked); setVisible(PAGE_SIZE); }}
            />
            Sitting leaders only
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SENIORITY_ORDER.map((sn) => (
            <button
              key={sn}
              onClick={() => toggleSeniority(sn)}
              className={[
                "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                seniorities.has(sn)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40",
              ].join(" ")}
              aria-pressed={seniorities.has(sn)}
            >
              {SENIORITY_LABEL[sn]}
            </button>
          ))}
        </div>
      </div>

      {/* Ranked list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {pool.length === 0
              ? "No non-academic experience records are available in your current access scope."
              : "No leaders match these filters."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.slice(0, visible).map(({ key, rec }) => {
              const top = rec.ties![0];
              const photo = photos[enrichKey(rec.name, rec.university)];
              const homeIndex = rec.indices?.[0] ?? null;
              const extraFirms = (rec.firms ?? []).length - 1;
              return (
                <div key={key} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                  {photo?.photo ? (
                    <img src={photo.photo} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover shrink-0 border border-border mt-0.5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">
                        {rec.name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <span>{rec.name}</span>
                      {!rec.sitting && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Past leader</span>
                      )}
                      {homeIndex && indexLabel.get(homeIndex) && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#011F5B]/10 text-[#011F5B] dark:bg-sky-900/40 dark:text-sky-300">
                          {indexLabel.get(homeIndex)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{rec.university}</p>
                    <p className="text-xs mt-1">
                      <span className="font-semibold">{top.firm}</span>
                      {top.role ? <span className="text-muted-foreground"> — {top.role}</span> : null}
                      {extraFirms > 0 && (
                        <span className="text-muted-foreground"> · +{extraFirms} more firm{extraFirms === 1 ? "" : "s"}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SENIORITY_CLS[rec.seniority ?? "unknown"]}`}>
                        {SENIORITY_LABEL[rec.seniority ?? "unknown"]}
                      </span>
                      {(rec.categories ?? []).slice(0, 2).map((i) => (
                        <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{i}</span>
                      ))}
                      {top.kind !== "employment" && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          {top.kind === "board" ? "Board seat" : "Advisory"}
                        </span>
                      )}
                      {top.endYear != null && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {top.endYear >= doc.asOf ? "Current" : `Until ${top.endYear}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-md bg-primary/10 text-primary"
                      title="Tie score (0–100): seniority + attachment + recency of the best single tie"
                    >
                      {rec.score}
                    </span>
                    {onOpenLeader && (
                      <button
                        onClick={() => onOpenLeader(homeIndex, rec.name)}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Open profile →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {filtered.length > visible && (
          <div className="border-t border-border p-3 text-center">
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more of {filtered.length}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
