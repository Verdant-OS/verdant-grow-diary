import type { ReactNode } from "react";
import {
  TentQuickLogTargetContext,
  type RegisterTentQuickLogTarget,
} from "@/context/TentQuickLogTargetContext";

export function TentQuickLogTargetScope({
  register,
  children,
}: {
  register: RegisterTentQuickLogTarget;
  children: ReactNode;
}) {
  return (
    <TentQuickLogTargetContext.Provider value={register}>
      {children}
    </TentQuickLogTargetContext.Provider>
  );
}
