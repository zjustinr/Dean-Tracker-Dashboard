import type { MovabilityTone } from "@/data/movability";

/**
 * Movability Index badge: a filled round gauge, echoing the BatonIndex mark but
 * recolored per reading and with the needle rotated low/high — so the same glyph
 * carries the signal even without reading the label next to it.
 *
 * Two readings, not three, matching the two bands the measurement supports (see
 * src/data/movability.ts). The needle points high for the band that departs more
 * often: at or past the cohort median, 69.6–75.2% of leaders had left within five
 * years, against 55.4% below it.
 */

const TONE_FILL: Record<MovabilityTone, string> = {
  low: "#CA8A04", // below the cohort median
  high: "#16A34A", // at or past the cohort median
};

// Needle angle in degrees off vertical, sweeping low (left) to high (right).
const TONE_ANGLE: Record<MovabilityTone, number> = {
  low: -45,
  high: 45,
};

// Needle + dial marks render in a fixed dark navy regardless of tone, so they
// stay legible against the white face at every reading -- only the badge fill
// and needle angle change.
const DIAL_INK = "#0F172A";

export function MovabilityGaugeIcon({ tone, size = 40, className }: { tone: MovabilityTone; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill={TONE_FILL[tone]} />
      <circle cx="32" cy="33" r="23" fill="#FFFFFF" />
      <circle cx="13" cy="33" r="3" fill={DIAL_INK} />
      <circle cx="32" cy="14" r="3" fill={DIAL_INK} />
      <circle cx="51" cy="33" r="3" fill={DIAL_INK} />
      <g transform={`rotate(${TONE_ANGLE[tone]} 32 33)`}>
        <rect x="30.2" y="15" width="3.6" height="18" rx="1.8" fill={DIAL_INK} />
      </g>
      <circle cx="32" cy="33" r="5" fill={DIAL_INK} />
    </svg>
  );
}
