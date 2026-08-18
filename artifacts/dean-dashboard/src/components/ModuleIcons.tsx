/**
 * One line icon per front-page module, keyed by tab value.
 *
 * Inline SVG (lucide-derived, MIT) rather than an icon dependency: the set is
 * tiny and fixed, and inlining keeps them immune to the font/asset issues that
 * bit the logo. Monochrome and stroke-only, so they inherit `currentColor` and
 * flip correctly between the navy active card and the light inactive ones.
 */
import type { ReactNode } from "react";

const P = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<string, ReactNode> = {
  // Individual Search — magnifier over a person
  search: (
    <>
      <circle cx="11" cy="10" r="3.2" />
      <path d="M6.5 19a5 5 0 0 1 9 0" />
      <circle cx="17" cy="16" r="3.2" />
      <path d="m19.4 18.4 2.1 2.1" />
    </>
  ),
  // School Explorer — columned building
  explorer: (
    <>
      <path d="M3 21h18" />
      <path d="M4 21V9l8-4 8 4v12" />
      <path d="M9 21v-6h6v6" />
      <path d="M7 12v3M12 12v3M17 12v3" />
    </>
  ),
  // Aggregate Trends — rising line
  trends: (
    <>
      <path d="M4 4v16h16" />
      <path d="m7 14 3-3 3 2 4-5" />
    </>
  ),
  // Discipline Search — map
  discipline: (
    <>
      <path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  // Scout Assistant — radar sweep locating a candidate
  scout: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="0.6" />
      <path d="M12 12 18.5 6.5" />
      <circle cx="18.5" cy="6.5" r="1.3" />
    </>
  ),
  // Leadership News & Market — newspaper
  jobmarket: (
    <>
      <path d="M4 5h13v14H4z" />
      <path d="M17 8h3v9a2 2 0 0 1-2 2h-1" />
      <path d="M7 8h7M7 11h7M7 14h4" />
    </>
  ),
  // Industry Ties — briefcase with an outgoing connection node
  industryties: (
    <>
      <rect x="3" y="8" width="15" height="11" rx="1.5" />
      <path d="M7.5 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12.5h15" />
      <path d="m18 12.5 2.8-2.8" />
      <circle cx="21" cy="9" r="1.4" />
    </>
  ),
  // Build Your Own Analysis — grid / pivot
  analysis: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 10h16M10 4v16" />
    </>
  ),
  // Insights — research document with a chart inside
  insights: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 17v-3M12 17v-5M15 17v-2" />
    </>
  ),
};

export default function ModuleIcon({ id, className }: { id: string; className?: string }) {
  const body = PATHS[id];
  if (!body) return null;
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className={className} {...P}>
      {body}
    </svg>
  );
}
