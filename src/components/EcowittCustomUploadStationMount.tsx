/**
 * Tent-page glue for the EcoWitt station card. Business rules stay in the
 * view model and claim service. This file only holds the one-time token
 * returned by create or rotate and the readings the parent already loaded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EcowittCustomUploadStationCard } from "@/components/EcowittCustomUploadStationCard";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { supabase } from "@/integrations/supabase/client";
import {
  createEcowittCustomUploadClaim,
  loadOpenEcowittCustomUploadClaim,
  revokeEcowittCustomUploadClaim,
  rotateEcowittCustomUploadClaim,
  type EcowittClaimRpcClient,
  type EcowittOpenClaim,
  type EcowittOpenClaimClient,
} from "@/lib/ecowittCustomUploadClaimService";
import {
  buildEcowittCustomUploadStationCard,
  resolveEcowittStationMountClaim,
  type EcowittStationReadingInput,
  type EcowittStationSession,
} from "@/lib/ecowittCustomUploadStationCardViewModel";

export interface EcowittClaimMountClient extends EcowittClaimRpcClient, EcowittOpenClaimClient {}

export interface EcowittCustomUploadStationMountProps {
  readonly tentId: string | null;
  readonly readings: readonly EcowittStationReadingInput[];
  readonly now?: Date;
  readonly claims?: EcowittClaimMountClient;
}

export function EcowittCustomUploadStationMount(props: EcowittCustomUploadStationMountProps) {
  const { tentId, readings, now, claims = supabase as unknown as EcowittClaimMountClient } = props;
  const [loaded, setLoaded] = useState<EcowittOpenClaim | null>(null);
  const [session, setSession] = useState<EcowittStationSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const ticket = ++generation.current;
    setSession(null);
    setActionError(null);
    if (tentId === null) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    void loadOpenEcowittCustomUploadClaim(claims, tentId).then((loadedClaim) => {
      if (cancelled || ticket !== generation.current) return;
      if (!loadedClaim.ok) {
        setLoaded(null);
        setActionError(ECOWITT_CUSTOM_UPLOAD_COPY.lookupFailed);
        return;
      }
      setLoaded(loadedClaim.claim);
    });
    return () => {
      cancelled = true;
    };
  }, [tentId, claims]);

  const resolved = resolveEcowittStationMountClaim({ loaded, session });
  const model = useMemo(
    () =>
      buildEcowittCustomUploadStationCard({
        tentId,
        readings,
        now: now ?? new Date(),
        intervalSeconds: resolved.intervalSeconds,
        lastReceivedAt: resolved.lastReceivedAt,
        claimState: resolved.claimState,
        claimId: resolved.claimId,
        justCreatedToken: resolved.justCreatedToken,
        createError: actionError,
      }),
    [tentId, readings, now, resolved, actionError],
  );

  async function onCreateLink(): Promise<void> {
    const ticket = ++generation.current;
    setCreating(true);
    setActionError(null);
    try {
      const created = await createEcowittCustomUploadClaim(claims, tentId);
      if (ticket !== generation.current) return;
      if (!created.ok) {
        setActionError(ECOWITT_CUSTOM_UPLOAD_COPY.createFailed);
        return;
      }
      setSession({ kind: "created", claimId: created.claimId, token: created.uploadToken });
    } finally {
      if (ticket === generation.current) setCreating(false);
    }
  }

  async function onRevokeLink(): Promise<void> {
    const ticket = ++generation.current;
    setCreating(true);
    setActionError(null);
    try {
      const revoked = await revokeEcowittCustomUploadClaim(claims, resolved.claimId);
      if (ticket !== generation.current) return;
      if (!revoked.ok || !revoked.revoked) {
        setActionError(ECOWITT_CUSTOM_UPLOAD_COPY.revokeFailed);
        return;
      }
      setSession({ kind: "revoked" });
    } finally {
      if (ticket === generation.current) setCreating(false);
    }
  }

  async function onRotateLink(): Promise<void> {
    const ticket = ++generation.current;
    setCreating(true);
    setActionError(null);
    try {
      const rotated = await rotateEcowittCustomUploadClaim(claims, resolved.claimId);
      if (ticket !== generation.current) return;
      if (!rotated.ok) {
        setActionError(ECOWITT_CUSTOM_UPLOAD_COPY.rotateFailed);
        return;
      }
      const claimId = resolved.claimId;
      if (claimId === null) {
        setActionError(ECOWITT_CUSTOM_UPLOAD_COPY.rotateFailed);
        return;
      }
      setSession({ kind: "rotated", claimId, token: rotated.uploadToken });
    } finally {
      if (ticket === generation.current) setCreating(false);
    }
  }

  return (
    <EcowittCustomUploadStationCard
      model={model}
      onCreateLink={onCreateLink}
      onRevokeLink={onRevokeLink}
      onRotateLink={onRotateLink}
      creating={creating}
    />
  );
}
