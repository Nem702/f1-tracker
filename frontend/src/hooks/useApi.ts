import { useEffect, useState } from "react";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch-on-dependency-change with one deliberate behavior: when the key
 * changes (a new race is selected), the previous data is KEPT while the new
 * request runs — the charts hold their last render at reduced opacity instead
 * of flashing a skeleton. `key` is the fetch argument; pass null to idle.
 */
export function useApi<T>(
  fetcher: (key: number) => Promise<T>,
  key: number | null,
): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcher(key)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // fetcher identities are stable module-level functions from api/client —
    // the race key is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
