import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { TentQuickLogTargetEvidence } from "@/lib/quickLogRouteTargetRules";

export type TentQuickLogTargetRegistration =
  ({ clear: false } & TentQuickLogTargetEvidence) | { clear: true; tentId: string };

export type RegisterTentQuickLogTarget = (registration: TentQuickLogTargetRegistration) => void;

const NOOP_REGISTER: RegisterTentQuickLogTarget = () => {};

export const TentQuickLogTargetContext = createContext<RegisterTentQuickLogTarget>(NOOP_REGISTER);

/*
 * Why a module-level store is kept here (Main FIX REQUEST #2643 item 3):
 * - The value is non-sensitive UI routing evidence (a tent id the grower is
 *   already viewing), never auth, account or write data.
 * - QuickLogV2Sheet is mounted by AppShell as a sibling of the
 *   TentQuickLogTargetScope provider, not inside it, so a provider-scoped read
 *   would need new AppShell/sheet wiring; the unlocked context-states test also
 *   publishes evidence without any provider and may not be edited further.
 * - The app is a client-only SPA with one AppShell, and only one Tent Detail is
 *   mounted at a time; no SSR request can share this module state.
 * - Cleanup clears the value only when it still holds the unmounting tent's id,
 *   so an old page can never clear a newer tent, and a stale id is still checked
 *   against Target Select's admitted tents (resolveSelectableTentId) before use.
 * - It never decides a write on its own: the sheet only preselects a tent the
 *   grower can see and change, and Save still needs content.
 */
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
