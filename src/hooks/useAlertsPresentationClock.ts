import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

export interface AlertsPresentationClock {
  now: number;
  refresh: () => void;
}

/** One page clock; new query evidence refreshes both presenters before paint. No reads or writes. */
export function useAlertsPresentationClock(
  observation?: unknown,
  shared?: AlertsPresentationClock,
): AlertsPresentationClock {
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(() => setNow(Date.now()), []);
  const ownsClock = shared === undefined;
  useEffect(() => {
    if (!ownsClock) return;
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [ownsClock, refresh]);
  const refreshClock = shared?.refresh ?? refresh;
  useLayoutEffect(() => refreshClock(), [observation, refreshClock]);
  return useMemo(() => shared ?? { now, refresh }, [shared, now, refresh]);
}
