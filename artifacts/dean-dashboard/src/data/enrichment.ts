import { useSyncExternalStore } from "react";

// Hardening Step 2: the global enrichment maps (dean photos, headhunter research)
// used to be bundled JSON imports — together ~5 MB of the JS bundle, and the
// research briefs are exactly the proprietary payload a trial must gate. They now
// live in public/data/*.json and load once at runtime.
//
// Each map is a tiny reactive store: components subscribe via the hook and
// re-render when the fetch resolves. Until then the map is empty, so portraits
// fall back to monograms and the research panel simply isn't shown yet.

export interface PhotoRec { photo: string; source?: string; page?: string }

export interface NewsItem { title: string; url: string; source?: string; date?: string }
export interface CareerStep { role: string; org?: string; years?: string }
export interface LeaderResearch {
  linkedin?: string;
  summary?: string;      // "why this leader" strengths brief
  expertise?: string[];  // signature themes / domains
  education?: string;    // degrees
  news?: NewsItem[];
  career?: CareerStep[]; // chronological pre-role trajectory (earliest → current)
}

function makeJsonMap<T>(file: string) {
  let data: Record<string, T> = {};
  let started = false;
  const listeners = new Set<() => void>();

  function ensure() {
    if (started) return;
    started = true;
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { data = (d ?? {}) as Record<string, T>; listeners.forEach((l) => l()); })
      .catch(() => { started = false; }); // allow a later mount to retry
  }
  function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
  const snapshot = () => data;

  return {
    ensure,
    current: () => data, // non-reactive read (for one-shot lookups outside render)
    useMap(): Record<string, T> {
      ensure();
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    },
  };
}

// A person's leadership rungs across ALL indices (dean/provost/president/system),
// so a profile can show the full ladder even though only one index is loaded.
export interface CareerRung { role: string; uni: string; school?: string; s: number | null; e: number | null; interim?: boolean }
export interface CareerLadder { name: string; roles: CareerRung[] }

const photos = makeJsonMap<PhotoRec>("dean-photos.json");
const research = makeJsonMap<LeaderResearch>("leader-research.json");
const careers = makeJsonMap<CareerLadder>("leader-careers.json");

export const usePhotoMap = photos.useMap;
export const getPhotoMap = photos.current;
export const useResearchMap = research.useMap;
export const useCareerMap = careers.useMap;

export const enrichKey = (dean: string, university: string) =>
  `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

// Must match norm() in scripts/gen-careers.mjs exactly.
export const careerKey = (dean: string) =>
  dean.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
