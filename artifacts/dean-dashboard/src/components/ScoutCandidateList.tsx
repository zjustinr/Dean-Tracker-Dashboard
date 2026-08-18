import { useState } from "react";
import type { Dean } from "@/data/types";
import { usePhotoMap, useResearchMap, enrichKey, useIndustryTies } from "@/data/enrichment";
import { affKey, SOURCE_THEME, type ScoutCandidate } from "@/data/useScoutCandidates";
import DeanProfile from "@/components/DeanProfile";
import { CareerAssessment, useCareerAnalysis, type Root } from "@/components/CareerMap";
import { MovabilityGaugeIcon } from "@/components/MovabilityGaugeIcon";
import careerRoots from "@/data/career-roots.json";

/**
 * The ranked-candidate-row renderer shared by the Scout Assistant section
 * embedded in Slate Builder and the standalone Scout Assistant module -- same
 * row chrome, expand-in-place profile, and Movability badge in both places.
 * Only the surrounding card (header, Methodology, filters) differs per host.
 */
export default function ScoutCandidateList({
  candidates, resolvedProfiles, resolveProfile, allDeans, onOpenSchool, emptyMessage,
}: {
  candidates: ScoutCandidate[];
  resolvedProfiles: Record<string, Dean | "not-found">;
  resolveProfile: (entry: { name: string; enrichKey: string; index: string | null; university: string }) => void;
  allDeans: Dean[];
  onOpenSchool?: (university: string, school: string) => void;
  emptyMessage: string;
}) {
  const photos = usePhotoMap();
  const researchMap = useResearchMap();
  // Named-firm industry ties (scripts/gen-industry-experience.mjs): a candidate
  // who carries a senior corporate network gets a chip saying WHICH firm at WHAT
  // rank -- exactly the door-opening signal the connections use case scouts for.
  const tiesPeople = useIndustryTies()?.people ?? null;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Cohort tenure distribution for the Movability Index, mirroring IndividualSearch's
  // own tenureFor (same cohort-wide percentiles, so the rating reads identically
  // wherever it's shown).
  function tenureFor(dn: Dean) {
    const NOW = 2026;
    const lens = allDeans.filter((x) => x.endYear != null && !x.isInterim && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number).sort((a, b) => a - b);
    const p = (q: number) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(q * lens.length))] : null);
    const past = allDeans.filter((x) => x.dean === dn.dean && x.id !== dn.id && x.endYear != null && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number);
    const personalAvg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
    return {
      sitting: dn.endYear == null,
      currentTenure: dn.endYear == null && dn.startYear ? NOW - dn.startYear : dn.tenureLength ?? null,
      median: p(0.5), p75: p(0.75), personalAvg, cohortN: lens.length,
    };
  }

  function MovabilityBadge({ dean }: { dean: Dean }) {
    const career = researchMap[enrichKey(dean.dean, dean.university)]?.career;
    const roots = (careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)];
    const { rating } = useCareerAnalysis(career || [], tenureFor(dean), roots);
    if (!rating) return null;
    return (
      <div className="flex flex-col items-center gap-0.5 shrink-0 w-14" title={`Movability Index: ${rating.label}`}>
        <MovabilityGaugeIcon tone={rating.tone} size={22} />
        <span className={`text-[9px] font-semibold px-1 py-0.5 rounded leading-none whitespace-nowrap ${rating.cls}`}>{rating.label}</span>
      </div>
    );
  }

  function ExpandedProfile({ dean, onClose }: { dean: Dean; onClose: () => void }) {
    const career = researchMap[enrichKey(dean.dean, dean.university)]?.career;
    const roots = (careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)];
    return (
      <div className="grid gap-3 grid-cols-[minmax(0,1fr)_260px] items-start">
        <DeanProfile dean={dean} onClose={onClose} onOpenSchool={onOpenSchool} hideAssessment />
        {career && career.length > 0 && (
          <div className="sticky top-4">
            <CareerAssessment steps={career} tenure={tenureFor(dean)} roots={roots} />
          </div>
        )}
      </div>
    );
  }

  function CandidateAvatar({ enrichKeyStr, name, theme }: { enrichKeyStr: string; name: string; theme: ScoutCandidate["source"] }) {
    const p = photos[enrichKeyStr];
    if (p?.photo) return <img src={p.photo} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />;
    const dotColor = theme === "bench" ? "#011F5B" : theme === "affinity" ? "#8C1D40" : theme === "weak" ? "#B45309" : "#64748B";
    return (
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${dotColor}1A` }}>
        <span className="text-xs font-bold" style={{ color: dotColor }}>{name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2)}</span>
      </div>
    );
  }

  if (candidates.length === 0) {
    return <p className="px-4 sm:px-5 py-4 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {candidates.map((c) => {
        const theme = SOURCE_THEME[c.source];
        const isOpen = expandedKey === c.key;
        const resolved = c.dean ?? (c.resolvable ? resolvedProfiles[affKey(c.resolvable)] : undefined);
        return (
          <div key={c.key}>
            <button
              onClick={() => {
                setExpandedKey(isOpen ? null : c.key);
                if (!isOpen && c.resolvable) resolveProfile(c.resolvable);
              }}
              className={["w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors", isOpen ? theme.row : "hover:bg-accent/40"].join(" ")}
            >
              <CandidateAvatar enrichKeyStr={c.dean ? enrichKey(c.dean.dean, c.dean.university) : c.resolvable!.enrichKey} name={c.name} theme={c.source} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${theme.pill}`}>{theme.label}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.subtitle}</p>
                {c.reasoning ? (
                  <p className={`text-xs mt-0.5 truncate ${theme.text}`}>
                    <span className="font-semibold">{c.reasoning.label}</span>{c.reasoning.detail ? ` — ${c.reasoning.detail}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic mt-0.5">No strong pattern match.</p>
                )}
                {(() => {
                  const k = c.dean ? enrichKey(c.dean.dean, c.dean.university) : c.resolvable?.enrichKey;
                  const rec = k && tiesPeople ? tiesPeople[k] : null;
                  const tie = rec?.status === "yes" && rec.ties?.length ? rec.ties[0] : null;
                  if (!tie) return null;
                  const rank = tie.seniority === "executive" ? "Executive" : tie.seniority === "senior" ? "Senior" : null;
                  return (
                    <p className="text-[10px] mt-0.5 truncate text-teal-700 dark:text-teal-400" title="Named-firm industry tie from recorded career stops">
                      <span className="font-semibold">Industry tie:</span> {rank ? `${rank} — ` : ""}{tie.firm}
                      {tie.kind !== "employment" ? ` (${tie.kind === "board" ? "board seat" : "advisory"})` : ""}
                    </p>
                  );
                })()}
                {!!c.matchedKeywords?.length && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.matchedKeywords.slice(0, 6).map((k) => (
                      <span key={k} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">{k}</span>
                    ))}
                    {c.matchedKeywords.length > 6 && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">+{c.matchedKeywords.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>
              {resolved && resolved !== "not-found" && <MovabilityBadge dean={resolved} />}
              <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
            </button>
            {isOpen && (
              <div className={`px-4 sm:px-5 pb-4 pt-1 border-l-2 ${theme.row} ${theme.border}`}>
                {!resolved ? (
                  <p className="text-xs text-muted-foreground py-3">Loading profile…</p>
                ) : resolved === "not-found" ? (
                  <p className="text-xs text-muted-foreground py-3">No detailed profile on file for {c.name} yet.</p>
                ) : (
                  <ExpandedProfile dean={resolved} onClose={() => setExpandedKey(null)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
