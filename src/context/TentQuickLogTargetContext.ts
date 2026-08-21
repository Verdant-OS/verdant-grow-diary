import { createContext, useContext, useEffect } from "react";
import type { TentQuickLogTargetEvidence } from "@/lib/quickLogRouteTargetRules";

export type TentQuickLogTargetRegistration =
  ({ clear: false } & TentQuickLogTargetEvidence) | { clear: true; tentId: string };

export type RegisterTentQuickLogTarget = (registration: TentQuickLogTargetRegistration) => void;

const NOOP_REGISTER: RegisterTentQuickLogTarget = () => {};

export const TentQuickLogTargetContext = createContext<RegisterTentQuickLogTarget>(NOOP_REGISTER);

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
    register({ clear: false, tentId, soleActivePlantId });
    return () => register({ clear: true, tentId });
  }, [register, soleActivePlantId, tentId]);
}
