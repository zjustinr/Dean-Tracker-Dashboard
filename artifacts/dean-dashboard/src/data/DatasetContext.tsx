import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { DATASETS, DATASET_LIST, DatasetId, DatasetBundle, DatasetMeta } from "./datasets";

interface DatasetCtx {
  datasetId: DatasetId;
  setDatasetId: (id: DatasetId) => void;
  bundle: DatasetBundle;
  meta: DatasetMeta;
  list: DatasetMeta[];
  // Dataset-aware label for the person a row represents: "Dean" for
  // business/engineering/medical/law schools, "Leader" for university
  // president/chancellor data, "Provost" for chief-academic-officer data.
  noun: string;
  nounPlural: string;
  nounLower: string;
  nounPluralLower: string;
  // The specific person's actual title (e.g. "President", "Chancellor",
  // "Executive Vice President and Provost") for datasets whose titles vary —
  // falls back to the generic noun otherwise. Interim/acting markers are
  // stripped since a separate Interim badge already conveys that.
  titleOf: (d: { discipline?: string | null } | null | undefined) => string;
}

const Ctx = createContext<DatasetCtx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  // top100 is hidden from DATASET_LIST for now, so it cannot be the default --
  // the switcher would have no active chip.
  const [datasetId, setDatasetId] = useState<DatasetId>("r1bschool");
  const value = useMemo(() => {
    const bundle = DATASETS[datasetId];
    const isUniv = bundle.meta.schoolType === "university";
    const isProvost = bundle.meta.schoolType === "provost";
    // Datasets that carry the officeholder's real title in `discipline`.
    const titleVaries = isUniv || isProvost;
    const noun = isUniv ? "Leader" : isProvost ? "Provost" : "Dean";
    const nounPlural = isUniv ? "Leaders" : isProvost ? "Provosts" : "Deans";
    const titleOf = (d: { discipline?: string | null } | null | undefined): string => {
      if (titleVaries) {
        const t = (d?.discipline || "")
          .replace(/\s*\([^)]*(interim|acting)[^)]*\)/gi, "") // "President (interim)" -> "President"
          .replace(/^\s*(interim|acting)\s+/i, "")            // "Interim President" -> "President"
          .trim();
        if (t && t.toLowerCase() !== "other") return t;
      }
      return noun;
    };
    return {
      datasetId,
      setDatasetId,
      bundle,
      meta: bundle.meta,
      list: DATASET_LIST,
      noun,
      nounPlural,
      nounLower: noun.toLowerCase(),
      nounPluralLower: nounPlural.toLowerCase(),
      titleOf,
    };
  }, [datasetId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDataset must be used within DatasetProvider");
  return v;
}
