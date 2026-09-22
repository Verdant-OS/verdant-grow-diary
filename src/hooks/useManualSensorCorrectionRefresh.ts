import { useContext, useEffect, useRef } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { subscribeManualSensorCorrections } from "@/lib/manualSensorCorrectionEvents";
import { invalidateManualSensorCorrectionReaders } from "@/lib/manualSensorCorrectionCache";

/** Private-shell receiver; remote messages invalidate reads, never supply values. */
export function useManualSensorCorrectionRefresh(ownerId: string | null): void {
  // A standalone shell can render without a query cache. It has no readers to
  // invalidate; do not create a channel or a replacement cache in that case.
  const client = useContext(QueryClientContext);
  const currentOwner = useRef(ownerId);
  currentOwner.current = ownerId;
  useEffect(() => {
    if (!client) return;
    return subscribeManualSensorCorrections(ownerId, (origin) => {
      // Fence an old subscription even between the identity render and cleanup.
      // Local saves already invalidate these families at receipt settlement.
      if (currentOwner.current === ownerId && origin === "other-tab")
        invalidateManualSensorCorrectionReaders(client);
    });
  }, [client, ownerId]);
}
