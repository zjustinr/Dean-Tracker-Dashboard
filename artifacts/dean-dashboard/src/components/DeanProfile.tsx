import type { Dean } from "@/data/types";
import { ORIGIN_LABELS, NEXT_ROLE_LABELS } from "@/data/types";
import { useDeanCareer } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import { Badge } from "@/components/ui/badge";
import { FullPortrait } from "./DeanPortrait";
import leaderResearch from "@/data/leader-research.json";

function formatMoney(val: number | null): string {
  if (!val) return "–";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${(val / 1e3).toFixed(0)}K`;
}

// Headhunter research pack, keyed by "dean|university" (lowercased).
interface NewsItem { title: string; url: string; source?: string; date?: string; }
interface LeaderResearch {
  linkedin?: string;
  summary?: string;      // "why this leader" strengths brief
  expertise?: string[];  // signature themes / domains
  education?: string;    // degrees
  news?: NewsItem[];
}
const RESEARCH = leaderResearch as Record<string, LeaderResearch>;
const researchKey = (dean: string, university: string) =>
  `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

interface Props {
  dean: Dean;
  onClose?: () => void;
  onOpenSchool?: (university: string, school: string) => void;
}

export default function DeanProfile({ dean, onClose, onOpenSchool }: Props) {
  const { noun, nounPluralLower } = useDataset();
  const careerPositions = useDeanCareer(dean.dean);
  const research = RESEARCH[researchKey(dean.dean, dean.university)] || null;
  const hasNews = !!research?.news?.length;

  return (
    <div className="bg-accent/30 rounded-xl p-5">
      <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between mb-3">
        <div>
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
            <p className="text-xs mt-0.5">
              <button
                type="button"
                onClick={() => onOpenSchool(dean.university, dean.school)}
                className="text-primary hover:underline underline-offset-2"
              >
                → View all {nounPluralLower} of {dean.school}
              </button>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {dean.startYear || "?"} – {dean.endYear || "Present"}
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
      </div>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {dean.gender === "F" && <Badge className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-0">Female</Badge>}
        {dean.gender === "M" && <Badge variant="secondary">Male</Badge>}
        {dean.isInterim && <Badge variant="outline">Interim</Badge>}
        {dean.isInternal && !dean.isInterim && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">Internal</Badge>}
        {dean.isExternal && !dean.isInterim && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">External</Badge>}
        {dean.isFirstTimeDean && <Badge variant="secondary">First-Time Dean</Badge>}
        {dean.hasPriorDeanExp && <Badge variant="secondary">Prior Dean Experience</Badge>}
        {dean.hasPhd && <Badge variant="secondary">PhD</Badge>}
        {dean.hasIndustryExp && <Badge variant="secondary">Industry Experience</Badge>}
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
            <span aria-hidden>🧭</span>
            <h4 className="text-sm font-bold">Headhunter Brief — Strengths & Distinctives</h4>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
          <span className="text-muted-foreground font-medium">Origin</span>
          <span>{ORIGIN_LABELS[dean.origin] || dean.origin}</span>
          <span className="text-muted-foreground font-medium">Background</span>
          <span>{dean.careerBackground || "–"}</span>
          <span className="text-muted-foreground font-medium">Discipline</span>
          <span>{dean.disciplineBroad || dean.discipline || "–"}</span>
          <span className="text-muted-foreground font-medium">PhD Field</span>
          <span>{dean.phdField || "–"}</span>
          <span className="text-muted-foreground font-medium">Prior Position</span>
          <span>{dean.priorTitle || "–"}</span>
          <span className="text-muted-foreground font-medium">Prior Institution</span>
          <span>{dean.priorInstitution || "–"}</span>
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
          <span className="text-muted-foreground font-medium">Post-{noun} Role</span>
          <span>{NEXT_ROLE_LABELS[dean.nextRole] || dean.nextRole || "–"}</span>
          <span className="text-muted-foreground font-medium">Involuntary Exit</span>
          <span>{dean.involuntary ? "Yes" : "No"}</span>
          <span className="text-muted-foreground font-medium">Had Prior Link</span>
          <span>{dean.hadPriorConnection ? "Yes" : "No"}</span>
        </div>
      </div>

      {(dean.priorAssocOrAsstDean || dean.hadDeptChairRole || dean.priorTitle) && (
        <div className="mt-4 pt-3 border-t border-border">
          <h4 className="text-sm font-bold mb-3">Prior Leadership History</h4>
          {(() => {
            const steps: { label: string; detail: string; year: string; isCurrent: boolean }[] = [];
            const earliest = careerPositions.length > 0 ? careerPositions[0] : dean;

            if (dean.hadAssocDeanRole || dean.priorAssocOrAsstDean) {
              const assocInst = earliest.priorTitle?.toLowerCase().includes("associate") || earliest.priorTitle?.toLowerCase().includes("assistant")
                ? earliest.priorInstitution || ""
                : "";
              const assocTitle = earliest.priorTitle?.toLowerCase().includes("associate") || earliest.priorTitle?.toLowerCase().includes("assistant")
                ? earliest.priorTitle
                : "Associate / Assistant Dean";
              steps.push({ label: assocTitle, detail: assocInst, year: "", isCurrent: false });
            }

            if (dean.hadDeptChairRole) {
              const chairInst = earliest.priorTitle?.toLowerCase().includes("chair")
                ? earliest.priorInstitution || ""
                : "";
              const chairTitle = earliest.priorTitle?.toLowerCase().includes("chair")
                ? earliest.priorTitle
                : "Department Chair";
              steps.push({ label: chairTitle, detail: chairInst, year: "", isCurrent: false });
            }

            if (careerPositions.length > 1) {
              const currentIdx = careerPositions.findIndex(p => p.id === dean.id);
              careerPositions.forEach((pos, i) => {
                if (i === currentIdx) return;
                steps.push({
                  label: `${noun}, ${pos.school}`,
                  detail: pos.university,
                  year: `${pos.startYear || "?"} – ${pos.endYear || "?"}`,
                  isCurrent: false,
                });
              });
            } else if (!dean.hadAssocDeanRole && !dean.priorAssocOrAsstDean && !dean.hadDeptChairRole && dean.priorTitle) {
              steps.push({
                label: dean.priorTitle,
                detail: dean.priorInstitution || "",
                year: "",
                isCurrent: false,
              });
            }

            steps.push({
              label: `${noun}, ${dean.school}`,
              detail: dean.university,
              year: `${dean.startYear || "?"} – ${dean.endYear || "Present"}`,
              isCurrent: true,
            });

            return (
              <div className="relative ml-1">
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1;
                  return (
                    <div key={i} className="flex items-start gap-3 relative">
                      <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border-2"
                          style={{
                            background: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                            color: "white",
                            borderColor: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--border))",
                          }}
                        >
                          {i + 1}
                        </div>
                        {!isLast && (
                          <svg width="2" height="32" className="my-0.5">
                            <line x1="1" y1="0" x2="1" y2="24" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" />
                            <polygon points="0,24 2,24 1,30" fill="hsl(var(--muted-foreground))" />
                          </svg>
                        )}
                      </div>
                      <div className="pb-2 min-h-[44px]">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${step.isCurrent ? "text-primary" : ""}`}>{step.label}</span>
                          {step.year && (
                            <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{step.year}</span>
                          )}
                        </div>
                        {step.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {hasNews && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <span aria-hidden>📰</span>
            <h4 className="text-sm font-bold">News &amp; Media</h4>
            <span className="text-[11px] text-muted-foreground">({research!.news!.length})</span>
          </div>
          <ul className="space-y-1.5">
            {research!.news!.map((n, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span aria-hidden className="text-muted-foreground select-none">›</span>
                <span className="min-w-0">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline underline-offset-2 break-words"
                  >
                    {n.title}
                  </a>
                  {(n.source || n.date) && (
                    <span className="text-xs text-muted-foreground">
                      {" "}— {[n.source, n.date].filter(Boolean).join(", ")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dean.notes && (
        <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border italic">{dean.notes}</p>
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
    </div>
  );
}
