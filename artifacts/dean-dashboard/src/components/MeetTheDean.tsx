import { useMemo, useState, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePhotoMap, enrichKey as photoKey } from "@/data/enrichment";

/**
 * Front-page sidebar: a random currently-serving dean, with a portrait
 * (curated official photo when one exists, initials avatar otherwise),
 * name + school, a link to their full profile in Individual Search,
 * and the source/school announcement URL.
 */
export default function MeetTheDean({ onOpenProfile }: { onOpenProfile: (dean: Dean) => void }) {
  const { noun, nounLower, datasetId } = useDataset();
  const allDeans = useAllDeans();
  const PHOTO_MAP = usePhotoMap();
  const current = useMemo(
    () => allDeans.filter((d) => d.endYear == null && d.dean && d.startYear && !/unknown/i.test(d.dean)),
    [allDeans]
  );
  // Browsable history of shown leaders (indices into `current`) so Prev can recall
  // who was shown earlier instead of only jumping to a fresh random one. Reseed a
  // random start whenever the dataset (or its leader list) changes.
  const [history, setHistory] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (current.length) { setHistory([Math.floor(Math.random() * current.length)]); setPos(0); }
  }, [datasetId, current.length]);
  const dean = current.length ? current[(history[pos] ?? 0) % current.length] : null;
  const canPrev = pos > 0;
  const goPrev = () => setPos((p) => Math.max(0, p - 1));
  const goNext = () => {
    if (pos < history.length - 1) { setPos((p) => p + 1); return; } // forward through recalled history
    let n = Math.floor(Math.random() * current.length); // at the frontier: draw a new leader
    if (current.length > 1 && n === history[pos]) n = (n + 1) % current.length;
    setHistory((h) => [...h, n]);
    setPos((p) => p + 1);
  };

  // Curated official-portrait map only (built by the photo-hunt agents);
  // initials monogram otherwise — no third-party photo lookups.
  const curated = dean ? PHOTO_MAP[photoKey(dean.dean, dean.university)] : undefined;
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(curated?.photo || null);
  }, [dean, curated?.photo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dean) return null;

  const initials = dean.dean.split(/\s+/).map((t) => t[0]).filter(Boolean).slice(0, 3).join("");
  const color = CHART_COLORS[Math.abs([...dean.university].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % CHART_COLORS.length];

  return (
    <Card className="lg:sticky lg:top-4 border-2" style={{ borderColor: "#011F5B" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {/* Prev/Next instead of a single shuffle, so viewers can step back to a
              leader they just saw. Prev walks the recalled history; Next advances it
              (drawing a new random leader once past the end). */}
          <button
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Previous leader"
            title="Previous leader"
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default text-lg leading-none"
          >
            ←
          </button>
          {/* "Leader" rather than the dataset's own noun: this is product chrome, and
              it should read the same across all 11 datasets. The person's actual title
              still appears verbatim below. */}
          <span className="flex-1 text-center">Meet a Leader</span>
          <button
            onClick={goNext}
            aria-label="Next leader"
            title="Next leader"
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            →
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center text-center gap-2 pb-5">
        {photo ? (
          <img
            src={photo}
            alt={dean.dean}
            className="w-32 h-32 rounded-full object-cover border-4 shadow-md"
            style={{ borderColor: color }}
            onError={() => {
              // local mirror failed -> try the original university URL once, then monogram
              const curated = PHOTO_MAP[photoKey(dean.dean, dean.university)];
              setPhoto(curated?.source && photo !== curated.source ? curated.source : null);
            }}
          />
        ) : (
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-md"
            style={{ background: color }}
            aria-label={dean.dean}
          >
            {initials}
          </div>
        )}
        <p className="font-bold text-base leading-tight mt-1">{dean.dean}</p>
        <p className="text-sm text-muted-foreground leading-snug">
          {dean.school}
          <br />
          {dean.university}
        </p>
        <p className="text-xs text-muted-foreground">
          {dean.isInterim ? `Interim ${nounLower}` : noun} since {dean.startYear}
          {dean.disciplineBroad && dean.disciplineBroad !== "Unknown" ? ` · ${dean.disciplineBroad}` : ""}
        </p>
        <button
          onClick={() => onOpenProfile(dean)}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          View full profile →
        </button>
        {dean.sourceUrl && (
          <a
            href={dean.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline underline-offset-2 hover:opacity-80 truncate max-w-full"
          >
            {dean.school || dean.university} announcement ↗
          </a>
        )}
      </CardContent>
    </Card>
  );
}
