/**
 * Tent-page glue for the EcoWitt station card. Business rules stay in the
 * view model and claim service. This file only holds the one-time token
 * returned by the create RPC and the readings the parent already loaded.
 */
import { useMemo, useState } from "react";
import { EcowittCustomUploadStationCard } from "@/components/EcowittCustomUploadStationCard";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { supabase } from "@/integrations/supabase/client";
import {
  createEcowittCustomUploadClaim,
  type EcowittClaimRpcClient,
} from "@/lib/ecowittCustomUploadClaimService";
import {
  buildEcowittCustomUploadStationCard,
  type EcowittStationReadingInput,
} from "@/lib/ecowittCustomUploadStationCardViewModel";

export interface EcowittCustomUploadStationMountProps {
  readonly tentId: string | null;
  readonly readings: readonly EcowittStationReadingInput[];
  readonly now?: Date;
}

export function EcowittCustomUploadStationMount(props: EcowittCustomUploadStationMountProps) {
  const { tentId, readings, now } = props;
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const model = useMemo(
    () =>
      buildEcowittCustomUploadStationCard({
        tentId,
        readings,
        now: now ?? new Date(),
        lastReceivedAt: null,
        claimState: justCreatedToken === null ? "none" : "unbound",
        justCreatedToken,
        createError,
      }),
    [tentId, readings, now, justCreatedToken, createError],
  );

  async function onCreateLink(): Promise<void> {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createEcowittCustomUploadClaim(
        supabase as unknown as EcowittClaimRpcClient,
        tentId,
      );
      if (!created.ok) {
        setCreateError(ECOWITT_CUSTOM_UPLOAD_COPY.createFailed);
        return;
      }
      setJustCreatedToken(created.uploadToken);
    } finally {
      setCreating(false);
    }
  }

  return (
    <EcowittCustomUploadStationCard model={model} onCreateLink={onCreateLink} creating={creating} />
  );
}
