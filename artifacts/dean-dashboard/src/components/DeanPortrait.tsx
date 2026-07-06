import { useState } from "react";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import deanPhotos from "@/data/dean-photos.json";

const PHOTO_MAP = deanPhotos as Record<string, { photo: string; source?: string; page?: string }>;

export const photoKey = (dean: string, university: string) =>
  `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

export function getDeanPhoto(dean: string, university: string) {
  return PHOTO_MAP[photoKey(dean, university)];
}

export function monogramColor(university: string): string {
  return CHART_COLORS[Math.abs([...university].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % CHART_COLORS.length];
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map((t) => t[0]).filter(Boolean).slice(0, 3).join("");
}

/** Small circular headshot for list rows; falls back to a colored monogram. */
export function MiniPortrait({ dean }: { dean: Dean }) {
  const curated = getDeanPhoto(dean.dean, dean.university);
  const [src, setSrc] = useState<string | null>(curated?.photo || null);
  const color = monogramColor(dean.university);

  if (src) {
    return (
      <img
        src={src}
        alt={dean.dean}
        loading="lazy"
        className="w-9 h-9 rounded-full object-cover border shrink-0"
        style={{ borderColor: color }}
        onError={() => setSrc(curated?.source && src !== curated.source ? curated.source : null)}
      />
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
      style={{ background: color }}
      aria-label={dean.dean}
    >
      {initialsOf(dean.dean)}
    </div>
  );
}

/** Wikipedia-infobox-style portrait for the expanded profile: full-size image
 *  on the right with a caption; monogram placeholder when no photo exists. */
export function FullPortrait({ dean }: { dean: Dean }) {
  const curated = getDeanPhoto(dean.dean, dean.university);
  const [src, setSrc] = useState<string | null>(curated?.photo || null);
  const color = monogramColor(dean.university);

  return (
    <figure className="w-44 shrink-0 bg-card border border-border rounded-lg p-2 self-start">
      {src ? (
        <img
          src={src}
          alt={dean.dean}
          className="w-full aspect-[4/5] object-cover rounded-md"
          onError={() => setSrc(curated?.source && src !== curated.source ? curated.source : null)}
        />
      ) : (
        <div
          className="w-full aspect-[4/5] rounded-md flex items-center justify-center text-4xl font-bold text-white"
          style={{ background: color }}
          aria-label={dean.dean}
        >
          {initialsOf(dean.dean)}
        </div>
      )}
      <figcaption className="text-center mt-1.5">
        <p className="text-xs font-semibold leading-tight">{dean.dean}</p>
        <p className="text-[10px] text-muted-foreground">
          Dean, {dean.startYear || "?"}–{dean.endYear || "present"}
        </p>
        {curated?.page && (
          <a
            href={curated.page}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-primary underline underline-offset-2 hover:opacity-80"
          >
            photo source ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}
