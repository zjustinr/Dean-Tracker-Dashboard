import { useMemo } from "react";
import type { Dean } from "@/data/types";
import { ORIGIN_LABELS, NEXT_ROLE_LABELS, genderNorm, yearsLabel } from "@/data/types";
import { useDeanCareer, useAllDeans } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import { Badge } from "@/components/ui/badge";
import { FullPortrait } from "./DeanPortrait";
import CareerMap, { CareerAssessment, type Root } from "@/components/CareerMap";
import careerRoots from "@/data/career-roots.json";
import careerGeo from "@/data/career-geo.json";
import { useResearchMap, enrichKey, useCareerMap, careerKey, syntheticCareerSteps, usePhotoMap, useIndustryTies, type NewsItem } from "@/data/enrichment";

function formatArchiveDate(capturedAt: string): string {
  // capturedAt is YYYYMMDD (see photo-lib.mjs's today()).
  if (!/^\d{8}$/.test(capturedAt)) return capturedAt;
  return `${capturedAt.slice(0, 4)}-${capturedAt.slice(4, 6)}-${capturedAt.slice(6, 8)}`;
}

function formatMoney(val: number | null): string {
  if (!val) return "–";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${(val / 1e3).toFixed(0)}K`;
}

interface Props {
  dean: Dean;
  onClose?: () => void;
  onOpenSchool?: (university: string, school: string) => void;
  // When rendered inside the Slate Builder, the movability assessment is shown in
  // the results map's right column instead of beside the map, so suppress it here.
  hideAssessment?: boolean;
}

export default function DeanProfile({ dean, onClose, onOpenSchool, hideAssessment }: Props) {
  const { noun, titleOf } = useDataset();
  const careerPositions = useDeanCareer(dean.dean);
  const title = titleOf(dean);
  const research = useResearchMap()[enrichKey(dean.dean, dean.university)] || null;
  // Industry-tie record (scripts/gen-industry-experience.mjs). When it names a
  // firm, the badge says WHICH firm -- for the connections use case the employer
  // is the information, not the boolean. The legacy hasIndustryExp flag stays as
  // the fallback for hand-labelled people the derivation couldn't reproduce.
  const industryDoc = useIndustryTies();
  const industryRec = industryDoc?.people[enrichKey(dean.dean, dean.university)] ?? null;
  const industryTies = industryRec?.status === "yes" ? industryRec.ties ?? [] : [];
  const industryTie = industryTies[0] ?? null;
  // Four states, and the profile reports ALL of them. Before, only the first
  // rendered anything: a named-firm tie exists for 494 of ~28,250 people, so
  // every other profile said nothing at all about industry -- which reads as
  // "no industry background" when the truth is usually "nobody researched it".
  //   named    -> firm(s), rank, years
  //   flagged  -> a corroborating label but no employer on record
  //   none     -> career stops exist and none is a company
  //   unknown  -> no career evidence at all (the record is simply absent)
  const industryState: "named" | "flagged" | "none" | "unknown" =
    industryTie ? "named"
    : industryRec?.status === "yes" ? "flagged"
    : industryRec?.status === "no" ? "none"
    : "unknown";
  const photoHistory = usePhotoMap()[enrichKey(dean.dean, dean.university)]?.history || [];
  const hasNews = !!research?.news?.length;
  const hasCareer = !!research?.career?.length;
  // The map/assessment fall back to a synthetic PhD -> current-seat trajectory
  // when there's no researched career at all (see syntheticCareerSteps) -- kept
  // separate from hasCareer/the text "Career Path" below, which stay real-data-only.
  const mapCareerSteps = hasCareer ? research!.career! : syntheticCareerSteps(dean, title);
  // Does the Career Map actually have >=2 US-geocoded stops? Drives the two-column
  // layout (map beside the timeline) so leaders without a map keep a full-width timeline.
  const mapRenders = mapCareerSteps.filter((s) => {
    const g = s.org ? (careerGeo as Record<string, { country: string; lat: number | null }>)[s.org.toLowerCase().trim()] : null;
    return g && g.lat != null;
  }).length >= 2;
  const ladder = useCareerMap()[careerKey(dean.dean)] || null;
  const hasLadder = !!ladder && ladder.roles.length >= 2;
  const isCurrent = !dean.endYear;
  const allDeans = useAllDeans();

  // Tenure inputs for the Career Map's movability rating: this leader's years in
  // the current role, their own past average tenure, and the cohort's completed
  // permanent-tenure distribution (median + 75th percentile) for this index.
  const tenure = useMemo(() => {
    const NOW = 2026;
    const lens = allDeans
      .filter((d) => d.endYear != null && !d.isInterim && (d.tenureLength ?? 0) > 0)
      .map((d) => d.tenureLength as number)
      .sort((a, b) => a - b);
    const pct = (p: number) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(p * lens.length))] : null);
    const pastLens = careerPositions
      .filter((p) => p.endYear != null && (p.tenureLength ?? 0) > 0)
      .map((p) => p.tenureLength as number);
    const personalAvg = pastLens.length ? pastLens.reduce((a, b) => a + b, 0) / pastLens.length : null;
    return {
      sitting: dean.endYear == null,
      currentTenure: dean.endYear == null && dean.startYear ? NOW - dean.startYear : dean.tenureLength ?? null,
      median: pct(0.5),
      p75: pct(0.75),
      personalAvg,
      cohortN: lens.length,
    };
  }, [allDeans, careerPositions, dean]);

  // "Last job before they first became a dean": the career step just before the
  // earliest TOP leadership role (dean/president/chancellor, excluding associate/
  // assistant/vice/deputy variants). Falls back to the row's own prior position.
  const firstLeadershipPrior = (() => {
    const c = research?.career;
    const isTop = (r: string) =>
      /\b(dean|president|chancellor)\b/i.test(r) &&
      !/\b(associate|assistant|vice|deputy|senior associate)\s+(dean|president|chancellor)/i.test(r);
    if (c && c.length) {
      const idx = c.findIndex((s) => isTop(s.role));
      if (idx > 0) return c[idx - 1];
    }
    if (dean.priorTitle) return { role: dean.priorTitle, org: dean.priorInstitution || "", years: "" };
    return null;
  })();

  // News search fallbacks so the News section is never empty/missing.
  const q = `"${dean.dean}" ${dean.university}`;
  const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(q)}`;
  const webSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;

  return (
    <div className="bg-accent/30 rounded-xl p-5">
      {/* Only the identity header (name/school/photo/close) shares width with the
          portrait -- everything below (Career Path, News & Media, etc.) runs the
          full card width instead of being squeezed by a shrink-0 photo column that,
          past this point, has nothing left in it. */}
      <div className="flex gap-5 items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold">{dean.dean}</h3>
          <p className="text-sm text-muted-foreground">
            {onOpenSchool ? (
              <button
                type="button"
                onClick={() => onOpenSchool(dean.university, dean.school)}
                className="text-left text-primary hover:underline underline-offset-2"
                title={`See the ${noun.toLowerCase()} history for ${dean.school}`}
              >
                {dean.university} – {dean.school} ↗
              </button>
            ) : (
              <>{dean.university} – {dean.school}</>
            )}
          </p>
          {onOpenSchool && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onOpenSchool(dean.university, dean.school)}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border border-border bg-muted hover:bg-accent shadow-sm"
              >
                → View all leaders of this institution
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {yearsLabel(dean.startYear, dean.endYear)}
            {dean.tenureLength ? ` · ${dean.tenureLength} years` : ""}
          </p>
          {dean.sourceUrl && (
            <p className="text-xs mt-1">
              <a href={dean.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
                {dean.school || dean.university} — announcement / source ↗
              </a>
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {onClose && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClose}
            >
              ✕ Close
            </button>
          )}
          <div className="max-sm:hidden">
            <FullPortrait dean={dean} onSchoolHistory={onOpenSchool ? () => onOpenSchool(dean.university, dean.school) : undefined} />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {genderNorm(dean.gender) === "F" && <Badge className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-0">Female</Badge>}
        {genderNorm(dean.gender) === "M" && <Badge variant="secondary">Male</Badge>}
        {dean.isInterim && <Badge variant="outline">Interim</Badge>}
        {dean.isInternal && !dean.isInterim && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">Internal</Badge>}
        {dean.isExternal && !dean.isInterim && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">External</Badge>}
        {dean.isFirstTimeDean && <Badge variant="secondary">First-Time Dean</Badge>}
        {dean.hasPriorDeanExp && <Badge variant="secondary">Prior Dean Experience</Badge>}
        {dean.hasPhd && <Badge variant="secondary">PhD</Badge>}
        {industryTie ? (
          <Badge
            variant="secondary"
            title={`${industryTie.role ? industryTie.role + ", " : ""}${industryTie.firm}${industryTie.years ? " (" + industryTie.years + ")" : ""} — from recorded career stops`}
          >
            Industry: {industryTie.firm}{(industryRec?.firms?.length ?? 0) > 1 ? ` +${industryRec!.firms!.length - 1}` : ""}
          </Badge>
        ) : (
          dean.hasIndustryExp && <Badge variant="secondary">Industry Experience</Badge>
        )}
        {dean.hasConsultingBg && <Badge variant="secondary">Consulting Background</Badge>}
      </div>

      {/* Headhunter research: quick links + strengths brief */}
      {(research?.linkedin || dean.sourceUrl) && (
        <div className="flex gap-2 flex-wrap mb-3">
          {research?.linkedin && (
            <a
              href={research.linkedin}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-[#0a66c2] text-white hover:opacity-90"
              title="LinkedIn profile"
            >
              <span className="font-bold">in</span> LinkedIn ↗
            </a>
          )}
          {dean.sourceUrl && (
            <a
              href={dean.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-accent"
              title="Appointment announcement / official source"
            >
              📄 Official source ↗
            </a>
          )}
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`"${dean.dean}" ${dean.university}`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-accent"
            title="Web search"
          >
            🔎 Web search ↗
          </a>
        </div>
      )}

      {research?.summary && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            
            <h4 className="text-sm font-bold">Brief: Strengths & Distinctives</h4>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{research.summary}</p>
          {research.education && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-medium">Education:</span> {research.education}
            </p>
          )}
          {!!research.expertise?.length && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {research.expertise.map((t, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-border">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Two columns split by theme, not by "always yes/no fields vs. text fields":
          left is who they are (stable credentials); right is the story of this
          specific appointment (how they got it, how it's going or how it ended).
          Keeps both columns populated instead of one tall column and one mostly
          empty one. */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
          <span className="text-muted-foreground font-medium">Origin</span>
          <span>{ORIGIN_LABELS[dean.origin] || dean.origin}</span>
          <span className="text-muted-foreground font-medium">Discipline</span>
          <span>{dean.disciplineBroad || dean.discipline || "–"}</span>
          <span className="text-muted-foreground font-medium">Background</span>
          <span>{dean.careerBackground || "–"}</span>
          {/* Always rendered, in all four states -- see industryState above for why
              silence was the wrong default. */}
          <span className="text-muted-foreground font-medium">Industry Experience</span>
          <span>
            {industryState === "named" ? (
              <>
                {(industryRec!.firms ?? []).join(", ")}
                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
                  {industryTie!.role ? `${industryTie!.role} · ` : ""}
                  {(industryRec!.industries ?? []).join(", ")}
                  {industryTie!.years ? ` · ${industryTie!.years}` : industryTie!.endYear != null ? ` · until ${industryTie!.endYear}` : ""}
                  {industryTie!.kind !== "employment" ? ` · ${industryTie!.kind === "board" ? "board seat" : "advisory"}` : ""}
                </span>
              </>
            ) : industryState === "flagged" ? (
              <>
                Noted, employer not on record
                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
                  {(industryRec!.flags ?? []).join("; ") || "Corroborating label only"}
                </span>
              </>
            ) : industryState === "none" ? (
              <>
                None in recorded career
                <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
                  {industryRec!.stops === 1
                    ? "Only one career stop on record — a weak signal"
                    : `Across ${industryRec!.stops} recorded career stops`}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {industryDoc ? "Not researched" : "Loading…"}
              </span>
            )}
          </span>
          <span className="text-muted-foreground font-medium">PhD Field</span>
          <span>{dean.phdField || "–"}</span>
          <span className="text-muted-foreground font-medium">PhD Institution</span>
          <span>{dean.phdInstitution || "–"}</span>
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
          <span className="text-muted-foreground font-medium">Prior Position</span>
          <span>{dean.priorTitle || "–"}</span>
          <span className="text-muted-foreground font-medium">Prior Institution</span>
          <span>{dean.priorInstitution || "–"}</span>
          {/* "Yes/No" told you nothing about what the tie actually was; name it. */}
          <span className="text-muted-foreground font-medium">Tie to {dean.university}</span>
          <span>{dean.connectionType || "None found"}</span>
          {firstLeadershipPrior && (
            <>
              <span className="text-muted-foreground font-medium">Before First {noun === "Dean" ? "Deanship" : "Leadership"}</span>
              <span>
                {firstLeadershipPrior.role}
                {firstLeadershipPrior.org ? <span className="text-muted-foreground"> — {firstLeadershipPrior.org}</span> : null}
              </span>
            </>
          )}
          <span className="text-muted-foreground font-medium">{isCurrent ? "Current Status" : "Next Role"}</span>
          <span>
            {isCurrent
              ? `${dean.isInterim ? "Interim " : ""}${title}${dean.startYear ? `, since ${dean.startYear}` : " (serving)"}`
              : (<>
                  {NEXT_ROLE_LABELS[dean.nextRole] || dean.nextRole || "–"}
                  {!isCurrent && dean.nextRoleDetail && (
                    <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{dean.nextRoleDetail}</span>
                  )}
                </>)}
          </span>
          {/* Only meaningful once the tenure is over -- "No" on a sitting leader who
              hasn't left yet was confusing, not informative. */}
          {!isCurrent && (
            <>
              <span className="text-muted-foreground font-medium">Departure from {dean.university}</span>
              <span>{dean.involuntary ? "Involuntary" : "Standard/voluntary"}</span>
            </>
          )}
        </div>
      </div>

      {(() => {
        // One unified "Career Path". Prefer the curated research trajectory
        // (research.career), which already subsumes the cross-index ladder; fall
        // back to the ladder / record flags only when there is no research career.
        // Built chronologically (earliest -> latest), then rendered bottom-up so
        // step 1 (earliest) sits at the bottom and time flows upward.
        type PStep = { label: string; detail: string; years: string; isCurrent: boolean };
        let path: PStep[] = [];
        if (hasCareer) {
          const arr = research!.career!;
          path = arr.map((step, i) => ({
            label: step.role,
            detail: step.org || "",
            years: step.years || "",
            isCurrent: /\b(present|current)\b/i.test(step.years || "") || i === arr.length - 1,
          }));
        } else if (hasLadder || dean.priorAssocOrAsstDean || dean.hadDeptChairRole || dean.priorTitle) {
          const earliest = careerPositions.length > 0 ? careerPositions[0] : dean;
          if (dean.hadDeptChairRole) {
            const isChair = earliest.priorTitle?.toLowerCase().includes("chair");
            path.push({ label: isChair ? earliest.priorTitle! : "Department Chair", detail: isChair ? earliest.priorInstitution || "" : "", years: "", isCurrent: false });
          }
          if (dean.hadAssocDeanRole || dean.priorAssocOrAsstDean) {
            const isA = /associate|assistant/.test(earliest.priorTitle?.toLowerCase() || "");
            path.push({ label: isA ? earliest.priorTitle! : "Associate / Assistant Dean", detail: isA ? earliest.priorInstitution || "" : "", years: "", isCurrent: false });
          }
          if (hasLadder) {
            ladder!.roles.forEach((r) => {
              const label = `${r.interim ? "Interim " : ""}${r.role}`;
              const detail = r.role === "Dean" && r.school ? `${r.school} · ${r.uni}` : r.uni;
              const viewing = r.uni === dean.university && (r.s ?? -1) === (dean.startYear ?? -2);
              path.push({ label, detail, years: `${r.s || "?"} – ${r.e || "Present"}`, isCurrent: viewing });
            });
          } else {
            if (careerPositions.length > 1) {
              const currentIdx = careerPositions.findIndex((p) => p.id === dean.id);
              careerPositions.forEach((pos, i) => {
                if (i === currentIdx) return;
                path.push({ label: `${titleOf(pos)}, ${pos.school}`, detail: pos.university, years: `${pos.startYear || "?"} – ${pos.endYear || "?"}`, isCurrent: false });
              });
            } else if (!dean.hadAssocDeanRole && !dean.priorAssocOrAsstDean && !dean.hadDeptChairRole && dean.priorTitle) {
              path.push({ label: dean.priorTitle, detail: dean.priorInstitution || "", years: "", isCurrent: false });
            }
            path.push({ label: `${title}, ${dean.school}`, detail: dean.university, years: `${dean.startYear || "?"} – ${dean.endYear || "Present"}`, isCurrent: true });
          }
        }
        if (!path.length) return null;

        const display = path.slice().reverse(); // latest first (top), earliest last (bottom)
        return (
          <>
          <div className="mt-4 pt-3 border-t border-border">
            <h4 className="text-sm font-bold mb-3">Career Path</h4>
            <div className={mapRenders ? "grid gap-5 items-start grid-cols-[minmax(0,220px)_minmax(0,1fr)]" : ""}>
            <div>
            <div className="relative ml-1">
              {display.map((step, j) => {
                const num = path.length - j; // earliest = 1 at the bottom, increasing upward
                const isBottom = j === display.length - 1;
                return (
                  <div key={j} className="flex items-start gap-3 relative">
                    <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border-2"
                        style={{
                          background: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                          color: "white",
                          borderColor: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--border))",
                        }}
                      >
                        {num}
                      </div>
                      {!isBottom && (
                        <svg width="2" height="32" className="my-0.5">
                          <polygon points="0,8 2,8 1,2" fill="hsl(var(--muted-foreground))" />
                          <line x1="1" y1="6" x2="1" y2="32" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" />
                        </svg>
                      )}
                    </div>
                    <div className="pb-2 min-h-[44px]">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${step.isCurrent ? "text-primary" : ""}`}>{step.label}</span>
                        {step.years && (
                          <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{step.years}</span>
                        )}
                      </div>
                      {step.detail && <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {hasLadder && !hasCareer && (
              <p className="text-[10px] text-muted-foreground mt-1">Roles linked across indices by name.</p>
            )}
            </div>
            {mapRenders && (
              <div className="min-w-0">
                <CareerMap steps={mapCareerSteps} roots={(careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)]} />
              </div>
            )}
            </div>
          </div>
          {/* Movability assessment as its own section, a peer of Career Path (and of
              News & Media below) rather than a squeezed side column. In the Slate Builder
              (hideAssessment) it is rendered in the results-map right column instead. */}
          {mapRenders && !hideAssessment && (
            <div className="mt-4 pt-3 border-t border-border">
              <CareerAssessment steps={mapCareerSteps} tenure={tenure} roots={(careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)]} />
            </div>
          )}
          </>
        );
      })()}

      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 mb-2">

          <h4 className="text-sm font-bold">News &amp; Media</h4>
          {hasNews && <span className="text-[11px] text-muted-foreground">({research!.news!.length})</span>}
        </div>
        {hasNews ? (
          <ul className="space-y-1.5">
            {research!.news!.map((raw, i) => {
              // A handful of research entries (a batch pass on the Creative Arts
              // index) stored bare headline strings instead of {title,url} --
              // render those as plain text instead of a blank, href-less link.
              const n: Partial<NewsItem> = typeof raw === "string" ? { title: raw } : raw;
              return (
              <li key={i} className="text-sm flex gap-2">
                <span aria-hidden className="text-muted-foreground select-none">›</span>
                <span className="min-w-0">
                  {n.url ? (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline underline-offset-2 break-words"
                    >
                      {n.title}
                    </a>
                  ) : (
                    <span className="break-words">{n.title}</span>
                  )}
                  {(n.source || n.date) && (
                    <span className="text-xs text-muted-foreground">
                      {" "}— {[n.source, n.date].filter(Boolean).join(", ")}
                    </span>
                  )}
                </span>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No curated coverage on file yet — search live sources:</p>
        )}
        <div className="flex gap-2 flex-wrap mt-2">
          <a
            href={googleNewsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-accent"
            title="Search Google News"
          >
            📰 Google News ↗
          </a>
          <a
            href={webSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border border-border hover:bg-accent"
            title="Web search"
          >
            🔎 Web ↗
          </a>
        </div>
      </div>

      {photoHistory.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <h4 className="text-sm font-bold mb-3">Historical Photos</h4>
          <div className="flex gap-3 flex-wrap">
            {photoHistory.map((h, i) => (
              <figure key={i} className="w-20 shrink-0">
                <img
                  src={h.photo}
                  alt={`${dean.dean}, earlier photo`}
                  loading="lazy"
                  className="w-20 h-24 object-cover rounded-md border border-border"
                />
                <figcaption className="text-center mt-1 text-[10px] text-muted-foreground leading-tight">
                  {h.capturedAt && <div>{formatArchiveDate(h.capturedAt)}</div>}
                  {h.page && (
                    <a
                      href={h.page}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      source ↗
                    </a>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {dean.notes && (
        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border italic">{dean.notes}</p>
      )}
    </div>
  );
}
