import { useMemo } from "react";
import type { Dean } from "@/data/types";
import { genderNorm } from "@/data/types";

/**
 * Read-only composition of a pool, as an audit rather than a filter.
 *
 * This replaced an "Include: All / Women / Men" control that selected candidates
 * on a protected characteristic. Auditing the composition of a pool is standard
 * practice; screening people in or out by gender as a selection step is not, and
 * it is the specific practice our buyers consult against. So the numbers stay and
 * the control goes: you can see what a slate is made of, and you cannot filter
 * people by it.
 */

export interface Composition {
  n: number;
  women: number;
  men: number;
  unknown: number;
}

export function composition(rows: Dean[]): Composition {
  let women = 0, men = 0, unknown = 0;
  for (const d of rows) {
    const g = genderNorm(d.gender);
    if (g === "F") women++;
    else if (g === "M") men++;
    else unknown++;
  }
  return { n: rows.length, women, men, unknown };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * One row: a labelled pool, its size, and the women/men/unrecorded split as a
 * stacked bar. Percentages are of the whole pool INCLUDING unrecorded gender --
 * quietly dropping the unrecorded would overstate both known shares.
 */
function CompositionRow({ label, hint, c }: { label: string; hint?: string; c: Composition }) {
  if (!c.n) return null;
  const w = pct(c.women, c.n), m = pct(c.men, c.n), u = 100 - w - m;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium" title={hint}>{label}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">n={c.n.toLocaleString()}</span>
      </div>
      <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`${label}: ${w}% women, ${m}% men, ${u}% gender not recorded`}>
        <div style={{ width: `${w}%` }} className="bg-[#E8A33D]" />
        <div style={{ width: `${m}%` }} className="bg-[#011F5B]" />
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
        {w}% women · {m}% men{c.unknown ? ` · ${u}% not recorded (${c.unknown.toLocaleString()})` : ""}
      </p>
    </div>
  );
}

/**
 * The composition of what the searcher is looking at, against the pool it was
 * drawn from, so a narrowed slate can be read against its own baseline.
 */
export default function PoolComposition({
  results, eligible, slate, nounPluralLower,
}: {
  /** The rows currently on screen, after every filter. */
  results: Dean[];
  /** The pool those rows were drawn from, before any filter. */
  eligible: Dean[];
  /** The saved slate, when the searcher has started one. */
  slate?: Dean[];
  nounPluralLower: string;
}) {
  const rc = useMemo(() => composition(results), [results]);
  const ec = useMemo(() => composition(eligible), [eligible]);
  const sc = useMemo(() => composition(slate ?? []), [slate]);
  if (!ec.n) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      {sc.n > 0 && <CompositionRow label="Your slate" c={sc} hint="The candidates you have saved." />}
      <CompositionRow label="These results" c={rc} hint="Everyone matching the current filters." />
      <CompositionRow
        label="Eligible pool"
        c={ec}
        hint={`Every ${nounPluralLower.replace(/s$/, "")} record in this index, before any filter.`}
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
        Composition is shown for review, not as a filter — no control here selects candidates on gender.
        Gender is recorded from public sources and is missing for some records; shares are of the whole pool,
        unrecorded included.
      </p>
    </div>
  );
}
