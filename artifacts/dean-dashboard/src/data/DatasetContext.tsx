import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { DATASETS, DATASET_LIST, DatasetId, DatasetBundle, DatasetMeta } from "./datasets";

interface DatasetCtx {
  datasetId: DatasetId;
  setDatasetId: (id: DatasetId) => void;
  bundle: DatasetBundle;
  meta: DatasetMeta;
  list: DatasetMeta[];
  // Dataset-aware label for the person a row represents: "Dean" for
  // business/engineering schools, "Leader" for university president/chancellor data.
  noun: string;
  nounPlural: string;
  nounLower: string;
  nounPluralLower: string;
}

const Ctx = createContext<DatasetCtx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [datasetId, setDatasetId] = useState<DatasetId>("top100");
  const value = useMemo(() => {
    const bundle = DATASETS[datasetId];
    const isUniv = bundle.meta.schoolType === "university";
    const noun = isUniv ? "Leader" : "Dean";
    const nounPlural = isUniv ? "Leaders" : "Deans";
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
    };
  }, [datasetId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDataset must be used within DatasetProvider");
  return v;
}
