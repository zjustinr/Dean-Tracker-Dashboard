import { useState, useMemo, useRef, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import type { Dean } from "@/data/types";
import DeanProfile from "@/components/DeanProfile";

function ComboBox({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="flex-1 min-w-[200px] relative" ref={ref}>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8"
        />
        <button
          type="button"
          onClick={() => { setOpen(!open); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent/40 transition-colors ${opt.toLowerCase() === value.toLowerCase() ? "bg-primary/10 font-semibold" : ""}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IndividualSearch() {
  const allDeans = useAllDeans();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [selectedDean, setSelectedDean] = useState<Dean | null>(null);

  const { lastNames, firstNames } = useMemo(() => {
    const lnSet = new Set<string>();
    const fnSet = new Set<string>();
    for (const d of allDeans) {
      const parts = d.dean.split(/\s+/);
      if (parts.length > 0) fnSet.add(parts[0]);
      if (parts.length > 1) lnSet.add(parts[parts.length - 1]);
    }
    return {
      lastNames: [...lnSet].sort((a, b) => a.localeCompare(b)),
      firstNames: [...fnSet].sort((a, b) => a.localeCompare(b)),
    };
  }, [allDeans]);

  const results = useMemo(() => {
    const ln = lastName.trim().toLowerCase();
    const fn = firstName.trim().toLowerCase();
    if (!ln && !fn) return [];

    const seen = new Set<string>();
    return allDeans.filter(d => {
      const parts = d.dean.split(/\s+/);
      const deanLast = parts[parts.length - 1].toLowerCase();
      const deanFirst = parts[0].toLowerCase();

      const matchLast = !ln || deanLast.startsWith(ln) || deanLast.includes(ln);
      const matchFirst = !fn || deanFirst.startsWith(fn) || deanFirst.includes(fn);

      if (matchLast && matchFirst) {
        const key = d.dean + "|||" + d.university + "|||" + d.school;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }
      return false;
    }).sort((a, b) => {
      const aLast = a.dean.split(/\s+/).pop() || "";
      const bLast = b.dean.split(/\s+/).pop() || "";
      const cmp = aLast.localeCompare(bLast);
      if (cmp !== 0) return cmp;
      return a.dean.localeCompare(b.dean);
    });
  }, [allDeans, lastName, firstName]);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold mb-1">Individual Dean Search</h2>
        <p className="text-sm text-muted-foreground mb-5">Search by name to view a dean's full profile and leadership history. Type to filter or browse the dropdown.</p>

        <div className="flex gap-4 flex-wrap">
          <ComboBox
            label="Last Name"
            placeholder="e.g. James"
            value={lastName}
            onChange={v => { setLastName(v); setSelectedDean(null); }}
            options={lastNames}
          />
          <ComboBox
            label="First Name"
            placeholder="e.g. Erika"
            value={firstName}
            onChange={v => { setFirstName(v); setSelectedDean(null); }}
            options={firstNames}
          />
          {(lastName || firstName) && (
            <div className="flex items-end">
              <button
                onClick={() => { setLastName(""); setFirstName(""); setSelectedDean(null); }}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {results.length > 0 && !selectedDean && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-medium">{results.length} result{results.length !== 1 ? "s" : ""} found</p>
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {results.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDean(d)}
                className="w-full text-left px-5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-4"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{d.dean.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{d.dean}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.school}, {d.university}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary tabular-nums">{d.startYear || "?"} – {d.endYear || "Present"}</p>
                  <div className="flex gap-1 justify-end mt-0.5">
                    {d.isInterim && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Interim</span>}
                    {d.rank && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Rank #{d.rank}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && (lastName || firstName) && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No deans found matching your search.</p>
        </div>
      )}

      {selectedDean && (
        <DeanProfile dean={selectedDean} onClose={() => setSelectedDean(null)} />
      )}
    </div>
  );
}
