import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { DATASETS, DATASET_LIST, DatasetId, DatasetBundle, DatasetMeta } from "./datasets";

interface DatasetCtx {
  datasetId: DatasetId;
  setDatasetId: (id: DatasetId) => void;
  bundle: DatasetBundle;
  meta: DatasetMeta;
  list: DatasetMeta[];
}

const Ctx = createContext<DatasetCtx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [datasetId, setDatasetId] = useState<DatasetId>("top100");
  const value = useMemo(() => {
    const bundle = DATASETS[datasetId];
    return {
      datasetId,
      setDatasetId,
      bundle,
      meta: bundle.meta,
      list: DATASET_LIST,
    };
  }, [datasetId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): DatasetCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDataset must be used within DatasetProvider");
  return v;
}
