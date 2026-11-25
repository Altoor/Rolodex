"use client";

import { useAssistedRunHistory } from "../hooks/use-assisted-runs";
import { AssistedRunHistory } from "../organisms/assisted-run-history";

/** Loads finished runs and renders the read-only history organism. */
export function AssistedRunHistoryContainer() {
  const { runs, loading } = useAssistedRunHistory(true);
  return <AssistedRunHistory runs={runs} loading={loading} />;
}
