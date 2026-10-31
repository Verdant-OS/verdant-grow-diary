import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { TentQuickLogTargetEvidence } from "@/lib/quickLogRouteTargetRules";

export type TentQuickLogTargetRegistration =
  ({ clear: false } & TentQuickLogTargetEvidence) | { clear: true; tentId: string };

export type RegisterTentQuickLogTarget = (registration: TentQuickLogTargetRegistration) => void;

const NOOP_REGISTER: RegisterTentQuickLogTarget = () => {};

export const TentQuickLogTargetContext = createContext<RegisterTentQuickLogTarget>(NOOP_REGISTER);

let tentQuickLogTargetEvidence: TentQuickLogTargetEvidence | null = null;
const tentQuickLogTargetListeners = new Set<() => void>();

function emitTentQuickLogTargetEvidence(): void {
  for (const listener of tentQuickLogTargetListeners) listener();
}

export function readTentQuickLogTargetEvidence(): TentQuickLogTargetEvidence | null {
  return tentQuickLogTargetEvidence;
}

export function subscribeTentQuickLogTargetEvidence(listener: () => void): () => void {
  tentQuickLogTargetListeners.add(listener);
  return () => {
    tentQuickLogTargetListeners.delete(listener);
  };
}

/** Record the tent Tent Detail already derived, or clear it with null. */
export function publishTentQuickLogTargetEvidence(next: TentQuickLogTargetEvidence | null): void {
  tentQuickLogTargetEvidence = next;
  emitTentQuickLogTargetEvidence();
}

export function useRegisteredTentQuickLogTentId(): string | null {
  const evidence = useSyncExternalStore(
    subscribeTentQuickLogTargetEvidence,
    readTentQuickLogTargetEvidence,
    readTentQuickLogTargetEvidence,
  );
  if (!evidence || typeof evidence.tentId !== "string") return null;
  const tentId = evidence.tentId.trim();
  return tentId.length > 0 ? tentId : null;
}

/**
 * Publish Tent Detail's already-derived target evidence to its owning shell.
 * The tent id travels with cleanup so an old page can never clear a newer
 * tent's registration during a route transition.
 */
export function useTentQuickLogTargetEvidence(
  tentId: string | null | undefined,
  soleActivePlantId: string | null,
): void {
  const register = useContext(TentQuickLogTargetContext);

  useEffect(() => {
    if (!tentId) return;
    publishTentQuickLogTargetEvidence({ tentId, soleActivePlantId });
    register({ clear: false, tentId, soleActivePlantId });
    return () => {
      const current = readTentQuickLogTargetEvidence();
      if (current?.tentId === tentId) publishTentQuickLogTargetEvidence(null);
      register({ clear: true, tentId });
    };
  }, [register, soleActivePlantId, tentId]);
}
