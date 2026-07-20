import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  resolvePlantDetailDisclosureTarget,
  type PlantDetailDisclosureGroup,
} from "@/lib/plantDetailDisclosureRules";

export interface PlantDetailDisclosureOpenState {
  history: boolean;
  harvest: boolean;
  ai: boolean;
}

export type PlantDetailRevealAndNavigate = (
  anchorId: string,
  preferredTarget?: HTMLElement | null,
) => void;

interface UsePlantDetailDisclosureNavigationInput {
  plantId: string | null | undefined;
}

const ALL_CLOSED: PlantDetailDisclosureOpenState = {
  history: false,
  harvest: false,
  ai: false,
};

function openStateFor(group: PlantDetailDisclosureGroup | null): PlantDetailDisclosureOpenState {
  return group ? { ...ALL_CLOSED, [group]: true } : { ...ALL_CLOSED };
}

function safelyFocusAndScroll(target: HTMLElement) {
  try {
    target.scrollIntoView?.({ behavior: "smooth", block: "center" });
  } catch {
    try {
      target.scrollIntoView?.();
    } catch {
      // Navigation polish must never break the page in older browsers/jsdom.
    }
  }
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  try {
    target.focus?.({ preventScroll: true });
  } catch {
    try {
      target.focus?.();
    } catch {
      // Focus support is optional in non-browser render environments.
    }
  }
}

export function usePlantDetailDisclosureNavigation({
  plantId,
}: UsePlantDetailDisclosureNavigationInput) {
  const location = useLocation();
  const [observedHash, setObservedHash] = useState(location.hash);
  const initialTarget = resolvePlantDetailDisclosureTarget(location.hash);
  const [openGroups, setOpenGroups] = useState<PlantDetailDisclosureOpenState>(() =>
    openStateFor(initialTarget?.group ?? null),
  );
  const previousPlantIdRef = useRef<string | null | undefined>(plantId);
  const pendingFrameRef = useRef<number | null>(null);

  const cancelPendingFrame = useCallback(() => {
    if (pendingFrameRef.current === null) return;
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(pendingFrameRef.current);
    }
    pendingFrameRef.current = null;
  }, []);

  const scheduleNavigation = useCallback(
    (anchorId: string, preferredTarget?: HTMLElement | null) => {
      cancelPendingFrame();
      if (
        typeof document === "undefined" ||
        typeof globalThis.requestAnimationFrame !== "function"
      ) {
        return;
      }
      pendingFrameRef.current = globalThis.requestAnimationFrame(() => {
        pendingFrameRef.current = null;
        const preferredIsMounted =
          preferredTarget &&
          (typeof preferredTarget.isConnected !== "boolean" || preferredTarget.isConnected);
        const target =
          (preferredIsMounted ? preferredTarget : null) ?? document.getElementById(anchorId);
        if (target) safelyFocusAndScroll(target);
      });
    },
    [cancelPendingFrame],
  );

  const setGroupOpen = useCallback((group: PlantDetailDisclosureGroup, open: boolean) => {
    setOpenGroups((current) => (current[group] === open ? current : { ...current, [group]: open }));
  }, []);

  const revealAndNavigate = useCallback<PlantDetailRevealAndNavigate>(
    (targetValue, preferredTarget) => {
      const target = resolvePlantDetailDisclosureTarget(targetValue);
      if (!target) return;
      if (target.group) {
        setOpenGroups((current) =>
          current[target.group] ? current : { ...current, [target.group]: true },
        );
      }
      scheduleNavigation(target.anchorId, preferredTarget);
    },
    [scheduleNavigation],
  );

  useEffect(() => {
    setObservedHash(location.hash);
  }, [location.hash]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHashChange = () => setObservedHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const plantChanged = previousPlantIdRef.current !== plantId;
    const target = resolvePlantDetailDisclosureTarget(plantChanged ? location.hash : observedHash);
    previousPlantIdRef.current = plantId;

    if (plantChanged) {
      cancelPendingFrame();
      setOpenGroups(openStateFor(target?.group ?? null));
    } else if (target?.group) {
      setOpenGroups((current) =>
        current[target.group] ? current : { ...current, [target.group]: true },
      );
    }

    if (target) scheduleNavigation(target.anchorId);
  }, [cancelPendingFrame, location.hash, observedHash, plantId, scheduleNavigation]);

  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  return {
    openGroups,
    setGroupOpen,
    revealAndNavigate,
  };
}
