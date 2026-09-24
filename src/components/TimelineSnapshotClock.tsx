import type { ReactNode } from "react";
import { useNowTick } from "@/hooks/useNowTick";

/** Keep time-sensitive snapshot rendering local to the row, not the full Timeline. */
export default function TimelineSnapshotClock({
  children,
}: {
  children: (nowMs: number) => ReactNode;
}) {
  const nowMs = useNowTick();
  return <>{children(nowMs)}</>;
}
