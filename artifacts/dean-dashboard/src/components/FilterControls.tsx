import { type ReactNode } from "react";

/**
 * The shared filter vocabulary for Slate Builder and Scout Assistant.
 *
 * WHY THIS EXISTS
 * ---------------
 * Both screens grew their own copy of the same filter block, and between them
 * they had five different ways of asking one question -- pills, segmented bars,
 * checkboxes, square state chips and dropdowns -- with labels sometimes inline
 * and sometimes above, and hint text in three styles. Nothing told a user which
 * control behaved which way until they clicked it.
 *
 * So the rule here is ONE IDIOM PER BEHAVIOUR, and every screen imports it:
 *
 *   pick exactly one of N          -> <SegGroup>     a segmented bar
 *   pick any of N, "All" = none    -> <PillGroup>    pills with an All escape
 *   independent yes/no switches    -> <PillToggles>  pills that latch
 *
 * `FilterRow` gives all of them one label column so every control starts at the
 * same x. That alignment is the whole of what used to read as "messy": it also
 * removes the orphaned "Region" label, which shared a flex row with Appointment
 * and had its control wrap away from it.
 *
 * Accent colours stay meaningful rather than decorative: navy is an ordinary
 * filter, teal marks a non-academic tie, maroon marks affinity to the target
 * school. Passing an accent is how a control says "this one means something
 * different", so it must never be used just for variety.
 */

export type Accent = "navy" | "teal" | "maroon";

const ACCENT_ON: Record<Accent, string> = {
  navy: "bg-[#011F5B] text-white",
  teal: "bg-[#0d6a72] text-white",
  maroon: "bg-[#8C1D40] text-white",
};

const OFF = "bg-muted/60 text-foreground hover:bg-muted";

/** One labelled filter row: fixed label column, control area, optional hint. */
export function FilterRow({
  label, hint, children, className = "",
}: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] ${className}`}>
      <span className="text-xs font-medium text-muted-foreground sm:text-right sm:pt-1.5">{label}</span>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
        {/* One hint style, always here: under its own control, never a trailing
            parenthetical and never floated to the right. */}
        {hint && <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>}
      </div>
    </div>
  );
}

/** Pick exactly one. Segmented bar -- the shape that says "these are alternatives". */
export function SegGroup<T extends string>({
  value, onChange, options, accent = "navy", ariaLabel,
}: {
  // T is inferred from `value` ALONE. Both other props are NoInfer because each
  // would otherwise widen it: the options array contributes plain `string`
  // literals, and a React setter contributes SetStateAction<T>. Left to infer
  // from all three, T collapses to `string` and every caller has to cast.
  value: T;
  onChange: (v: NoInfer<T>) => void;
  options: [NoInfer<T>, ReactNode][];
  accent?: Accent;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-lg border border-muted-foreground/30 overflow-hidden text-xs font-semibold">
      {options.map(([v, label], i) => (
        <button
          key={v} type="button" aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={[
            "px-3 py-1.5 transition-colors",
            i > 0 ? "border-l border-muted-foreground/30" : "",
            value === v ? ACCENT_ON[accent] : "bg-background hover:bg-muted",
          ].join(" ")}
        >{label}</button>
      ))}
    </div>
  );
}

/**
 * Pick any number. An empty set means "All", so the All pill is the reset and is
 * shown active exactly when nothing else is -- which is what makes an empty
 * selection legible as a deliberate state rather than a forgotten one.
 */
export function PillGroup({
  selected, onToggle, onClear, options, accent = "navy", counts, ariaLabel,
}: {
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  options: string[];
  accent?: Accent;
  counts?: Record<string, number>;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onClear} aria-pressed={selected.size === 0}
        className={["px-2.5 py-1 rounded-md text-xs font-semibold transition-colors", selected.size === 0 ? ACCENT_ON[accent] : OFF].join(" ")}>
        All
      </button>
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={selected.has(o)}
          className={["px-2.5 py-1 rounded-md text-xs font-semibold transition-colors", selected.has(o) ? ACCENT_ON[accent] : OFF].join(" ")}>
          {o}
          {counts?.[o] != null && (
            <span className={selected.has(o) ? "text-white/70 ml-1 tabular-nums" : "text-muted-foreground ml-1 tabular-nums"}>{counts[o]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Independent switches. These were checkboxes; they are pills now for one
 * reason -- a checkbox and a pill sitting in the same panel look like different
 * kinds of thing, and here they are not. The latched state carries the meaning,
 * and `aria-pressed` keeps it a toggle for assistive tech.
 */
export function PillToggles({
  items,
}: { items: { key: string; label: string; on: boolean; onToggle: () => void; accent?: Accent }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={it.onToggle} aria-pressed={it.on}
          className={["px-2.5 py-1 rounded-md text-xs font-semibold transition-colors", it.on ? ACCENT_ON[it.accent ?? "navy"] : OFF].join(" ")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A collapsible section of related filters.
 *
 * `summary` is the point of it: collapsed, the group still says what it is
 * currently doing, so a closed group is never a place where something might be
 * hiding. Groups that hold an active filter open themselves.
 */
export function FilterGroup({
  title, summary, defaultOpen = false, children,
}: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-muted-foreground/20 overflow-hidden">
      <summary className="cursor-pointer list-none select-none px-3 py-2 bg-muted/40 hover:bg-muted/70 flex items-center gap-2 text-xs font-semibold">
        <span aria-hidden className="text-[9px] text-muted-foreground transition-transform group-open:rotate-90">▶</span>
        {title}
        <span className="ml-auto font-medium text-[11px] text-muted-foreground truncate max-w-[55%]">{summary}</span>
      </summary>
      <div className="p-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

export interface ActiveChip {
  /** Stable identity, so React keys and removal never rely on the label text. */
  id: string;
  label: string;
  accent?: Accent;
  onRemove: () => void;
}

/**
 * What is currently narrowing the list, as removable chips.
 *
 * This is the part that answers "why am I seeing 84 people" without making
 * anyone reconstruct it by reading every control. It renders nothing when
 * nothing is filtering -- an empty bar would just be a permanent empty shelf.
 */
export function ActiveFilterBar({
  chips, onClearAll, resultCount, noun,
}: { chips: ActiveChip[]; onClearAll: () => void; resultCount?: number; noun?: string }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-muted-foreground/25 bg-muted/30 px-2.5 py-2">
      <span className="text-xs font-medium text-muted-foreground mr-0.5">Filtering by</span>
      {chips.map((c) => (
        <span key={c.id}
          className={["inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-semibold", ACCENT_ON[c.accent ?? "navy"]].join(" ")}>
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}
            className="w-4 h-4 grid place-items-center rounded-full bg-white/25 hover:bg-white/45 text-[11px] leading-none">×</button>
        </span>
      ))}
      {resultCount != null && (
        <span className="text-xs text-muted-foreground ml-1 tabular-nums">
          → <b className="text-foreground font-semibold">{resultCount.toLocaleString()}</b>{noun ? ` ${noun}` : ""}
        </span>
      )}
      <button type="button" onClick={onClearAll}
        className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2">
        Clear all
      </button>
    </div>
  );
}
