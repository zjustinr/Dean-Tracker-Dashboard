import { useMemo, useState, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import deanPhotos from "@/data/dean-photos.json";

const PHOTO_MAP = deanPhotos as Record<string, { photo: string; source?: string; page?: string }>;
const photoKey = (dean: string, university: string) => `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

/**
 * Front-page sidebar: a random currently-serving dean, with a portrait
 * (Wikipedia thumbnail when one exists, initials avatar otherwise),
 * name + school, a link to their full profile in Individual Search,
 * and the source/school announcement URL.
 */
export default function MeetTheDean({ onOpenProfile }: { onOpenProfile: (dean: Dean) => void }) {
  const allDeans = useAllDeans();
  const current = useMemo(
    () => allDeans.filter((d) => d.endYear == null && d.dean && d.startYear && !/unknown/i.test(d.dean)),
    [allDeans]
  );
  const [pick, setPick] = useState(() => Math.random());
  const dean = current.length ? current[Math.floor(pick * current.length) % current.length] : null;

  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setPhoto(null);
    if (!dean) return;
    // 1. Curated official-portrait map (built by the photo-hunt agents)
    const curated = PHOTO_MAP[photoKey(dean.dean, dean.university)];
    if (curated?.photo) {
      setPhoto(curated.photo);
      return () => { alive = false; };
    }
    const ACADEMIC = /dean|professor|academic|business|econom|universit|management|school/;
    const summaryThumb = async (title: string): Promise<string | null> => {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`);
      if (!r.ok) return null;
      const j = await r.json();
      const desc = `${j.description || ""} ${j.extract || ""}`.toLowerCase();
      return j.thumbnail?.source && ACADEMIC.test(desc) ? j.thumbnail.source : null;
    };
    (async () => {
      try {
        // 1. direct page title; 2. title search (catches "Name (academic)" etc.)
        let src = await summaryThumb(dean.dean.trim());
        if (!src) {
          const s = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(dean.dean.trim())}&limit=3`);
          if (s.ok) {
            const { pages = [] } = await s.json();
            const last = dean.dean.trim().split(/\s+/).pop()!.toLowerCase();
            for (const p of pages) {
              if (!p.title.toLowerCase().includes(last)) continue;
              src = await summaryThumb(p.title);
              if (src) break;
            }
          }
        }
        if (alive && src) setPhoto(src);
      } catch { /* fall back to initials avatar */ }
    })();
    return () => { alive = false; };
  }, [dean]);

  if (!dean) return null;

  const initials = dean.dean.split(/\s+/).map((t) => t[0]).filter(Boolean).slice(0, 3).join("");
  const color = CHART_COLORS[Math.abs([...dean.university].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % CHART_COLORS.length];

  return (
    <Card className="lg:sticky lg:top-4 border-2 border-dashed border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span aria-hidden>🎓</span> Meet a Dean (Randomly)
          <button
            onClick={() => setPick(Math.random())}
            aria-label="Show another dean"
            title="Show another dean"
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
          {dean.isInterim ? "Interim dean" : "Dean"} since {dean.startYear}
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
