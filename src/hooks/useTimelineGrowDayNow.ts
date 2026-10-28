import { useEffect, useState } from "react";
import { nextLocalMidnight } from "@/lib/plantStartDateRules";

/** Clock for the Timeline grow-day header. Re-renders at each local midnight. */
export function useTimelineGrowDayNow(): Date {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const delay = Math.max(0, nextLocalMidnight(clock).getTime() - Date.now());
    const timer = setTimeout(() => {
      setClock(new Date());
    }, delay);
    return () => clearTimeout(timer);
  }, [clock]);

  return clock;
}
