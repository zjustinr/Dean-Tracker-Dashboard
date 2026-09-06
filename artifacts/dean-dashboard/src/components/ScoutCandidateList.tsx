import { useState } from "react";
import type { Dean } from "@/data/types";
import { usePhotoMap, useResearchMap, enrichKey, useNonAcademicExperience } from "@/data/enrichment";
import { affKey, SOURCE_THEME, type ScoutCandidate } from "@/data/useScoutCandidates";
import DeanProfile from "@/components/DeanProfile";
import { CareerAssessment, useCareerAnalysis, type Root } from "@/components/CareerMap";
import { MovabilityGaugeIcon } from "@/components/MovabilityGaugeIcon";
import SourceLink from "@/components/SourceLink";
import { tenureInfoFor } from "@/data/movability";
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
  // Named-firm industry ties (scripts/gen-nonacademic-experience.mjs): a candidate
  // who carries a senior corporate network gets a chip saying WHICH firm at WHAT
  // rank -- exactly the door-opening signal the connections use case scouts for.
  const tiesPeople = useNonAcademicExperience()?.people ?? null;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Cohort tenure inputs for the Movability Index, from the shared module — the
  // same cohort median everywhere the chip is shown, built from completed spells
  // only (see src/data/tenure.ts).
  const tenureFor = (dn: Dean) => tenureInfoFor(dn, allDeans);

  function MovabilityBadge({ dean }: { dean: Dean }) {
    const career = researchMap[enrichKey(dean.dean, dean.university)]?.career;
    const roots = (careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)];
    const { rating } = useCareerAnalysis(career || [], tenureFor(dean), roots);
    if (!rating) return null;
    return (
      <div className="flex flex-col items-center gap-0.5 shrink-0 w-16" title={`Movability Index: ${rating.longLabel} — ${rating.reason}`}>
        <MovabilityGaugeIcon tone={rating.tone} size={22} />
        <span className={`text-[9px] font-semibold px-1 py-0.5 rounded leading-tight text-center ${rating.cls}`}>{rating.chipLabel}</span>
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
            {/* The row is a flex strip, not one big button: the expand target, the
                source link and the chevron are three separate controls, and an <a>
                cannot live inside a <button>. */}
            <div className={["flex items-center gap-2 pr-4 sm:pr-5 transition-colors", isOpen ? theme.row : "hover:bg-accent/40"].join(" ")}>
            <button
              onClick={() => {
                setExpandedKey(isOpen ? null : c.key);
                if (!isOpen && c.resolvable) resolveProfile(c.resolvable);
              }}
              className="flex-1 min-w-0 flex items-center gap-3 pl-4 sm:pl-5 py-2.5 text-left"
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
                    <p className="text-[10px] mt-0.5 truncate text-teal-700 dark:text-teal-400" title="Named non-academic employer, board seat or advisory role">
                      <span className="font-semibold">Non-academic:</span> {rank ? `${rank} — ` : ""}{tie.firm}
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
            </button>
            {/* Sits outside the row button (an <a> cannot nest inside one). Only
                for a candidate whose record has been read -- an unresolved row
                has no source to point at yet, and "no source" would be a claim
                about the record rather than about what we have loaded. */}
            {resolved && resolved !== "not-found" && (
              <SourceLink url={resolved.sourceUrl} subject={resolved.dean} className="self-center" />
            )}
            <button
              onClick={() => {
                setExpandedKey(isOpen ? null : c.key);
                if (!isOpen && c.resolvable) resolveProfile(c.resolvable);
              }}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${c.name}`}
              className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0 self-center"
            >{isOpen ? "–" : "+"}</button>
            </div>
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
