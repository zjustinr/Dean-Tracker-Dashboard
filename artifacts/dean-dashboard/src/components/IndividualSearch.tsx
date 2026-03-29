import { useState, useMemo } from "react";
import { useAllDeans } from "@/data/useData";
import type { Dean } from "@/data/types";
import DeanProfile from "@/components/DeanProfile";

export default function IndividualSearch() {
  const allDeans = useAllDeans();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [selectedDean, setSelectedDean] = useState<Dean | null>(null);

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
        <p className="text-sm text-muted-foreground mb-5">Search by name to view a dean's full profile and leadership history.</p>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => { setLastName(e.target.value); setSelectedDean(null); }}
              placeholder="e.g. James"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => { setFirstName(e.target.value); setSelectedDean(null); }}
              placeholder="e.g. Erika"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
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
