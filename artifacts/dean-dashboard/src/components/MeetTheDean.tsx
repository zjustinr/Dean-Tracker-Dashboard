import { useMemo, useState, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import deanPhotos from "@/data/dean-photos.json";

const PHOTO_MAP = deanPhotos as Record<string, { photo: string; source?: string; page?: string }>;
const photoKey = (dean: string, university: string) => `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

/**
 * Front-page sidebar: a random currently-serving dean, with a portrait
 * (curated official photo when one exists, initials avatar otherwise),
 * name + school, a link to their full profile in Individual Search,
 * and the source/school announcement URL.
 */
export default function MeetTheDean({ onOpenProfile }: { onOpenProfile: (dean: Dean) => void }) {
  const { noun, nounLower } = useDataset();
  const allDeans = useAllDeans();
  const current = useMemo(
    () => allDeans.filter((d) => d.endYear == null && d.dean && d.startYear && !/unknown/i.test(d.dean)),
    [allDeans]
  );
  const [pick, setPick] = useState(() => Math.random());
  const dean = current.length ? current[Math.floor(pick * current.length) % current.length] : null;

  // Curated official-portrait map only (built by the photo-hunt agents);
  // initials monogram otherwise — no third-party photo lookups.
  const curated = dean ? PHOTO_MAP[photoKey(dean.dean, dean.university)] : undefined;
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(curated?.photo || null);
  }, [dean]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dean) return null;

  const initials = dean.dean.split(/\s+/).map((t) => t[0]).filter(Boolean).slice(0, 3).join("");
  const color = CHART_COLORS[Math.abs([...dean.university].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % CHART_COLORS.length];

  return (
    <Card className="lg:sticky lg:top-4 border-2" style={{ borderColor: "#011F5B" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {/* "Leader" rather than the dataset's own noun: this is product chrome, and
              it should read the same across all 11 datasets. The person's actual title
              still appears verbatim below. */}
          Meet a Leader
          <button
            onClick={() => setPick(Math.random())}
            aria-label="Show another leader"
            title="Show another leader"
            className="ml-auto text-muted-foreground hover:text-foreground text-sm"
          >
            ↻
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
