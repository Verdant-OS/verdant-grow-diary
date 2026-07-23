import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
  options?: { updateHash?: boolean; replace?: boolean },
) => void;

interface UsePlantDetailDisclosureNavigationInput {
  plantId: string | null | undefined;
}

const ALL_CLOSED: PlantDetailDisclosureOpenState = {
  history: false,
  harvest: false,
  ai: false,
};

interface PlantDetailDisclosureState {
  plantId: string | null | undefined;
  routeHash: string;
  openGroups: PlantDetailDisclosureOpenState;
}

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
  const navigate = useNavigate();
  const initialTarget = resolvePlantDetailDisclosureTarget(location.hash);
  const [disclosureState, setDisclosureState] = useState<PlantDetailDisclosureState>(() => ({
    plantId,
    routeHash: location.hash,
    openGroups: openStateFor(initialTarget?.group ?? null),
  }));
  const pendingFrameRef = useRef<number | null>(null);

  const routeScopeChanged =
    disclosureState.plantId !== plantId || disclosureState.routeHash !== location.hash;
  const openGroups = routeScopeChanged
    ? openStateFor(resolvePlantDetailDisclosureTarget(location.hash)?.group ?? null)
    : disclosureState.openGroups;

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

  const setGroupOpen = useCallback(
    (group: PlantDetailDisclosureGroup, open: boolean) => {
      setDisclosureState((current) => {
        const scopeMatches = current.plantId === plantId && current.routeHash === location.hash;
        const currentGroups = scopeMatches
          ? current.openGroups
          : openStateFor(resolvePlantDetailDisclosureTarget(location.hash)?.group ?? null);
        if (scopeMatches && currentGroups[group] === open) return current;
        return {
          plantId,
          routeHash: location.hash,
          openGroups: { ...currentGroups, [group]: open },
        };
      });
    },
    [location.hash, plantId],
  );

  const revealAndNavigate = useCallback<PlantDetailRevealAndNavigate>(
    (targetValue, preferredTarget, options) => {
      const target = resolvePlantDetailDisclosureTarget(targetValue);
      if (!target) return;
      if (target.group) {
        setDisclosureState((current) => {
          const scopeMatches = current.plantId === plantId && current.routeHash === location.hash;
          const currentGroups = scopeMatches
            ? current.openGroups
            : openStateFor(resolvePlantDetailDisclosureTarget(location.hash)?.group ?? null);
          if (scopeMatches && currentGroups[target.group]) return current;
          return {
            plantId,
            routeHash: location.hash,
            openGroups: { ...currentGroups, [target.group]: true },
          };
        });
      }
      scheduleNavigation(target.anchorId, preferredTarget);

      const nextHash = `#${target.anchorId}`;
      if (options?.updateHash && location.hash !== nextHash) {
        navigate(
          {
            pathname: location.pathname,
            search: location.search,
            hash: nextHash,
          },
          { replace: options.replace ?? false },
        );
      }
    },
    [location.hash, location.pathname, location.search, navigate, plantId, scheduleNavigation],
  );

  useEffect(() => {
    const target = resolvePlantDetailDisclosureTarget(location.hash);
    cancelPendingFrame();
    setDisclosureState((current) => {
      if (current.plantId === plantId && current.routeHash === location.hash) return current;
      return {
        plantId,
        routeHash: location.hash,
        openGroups: openStateFor(target?.group ?? null),
      };
    });
    if (target) scheduleNavigation(target.anchorId);
  }, [cancelPendingFrame, location.hash, plantId, scheduleNavigation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHashChange = () => {
      const target = resolvePlantDetailDisclosureTarget(window.location.hash);
      if (!target) return;
      if (target.group) {
        setDisclosureState((current) => {
          const currentGroups =
            current.plantId === plantId ? current.openGroups : openStateFor(null);
          if (current.plantId === plantId && currentGroups[target.group]) return current;
          return {
            plantId,
            routeHash: location.hash,
            openGroups: { ...currentGroups, [target.group]: true },
          };
        });
      }
      scheduleNavigation(target.anchorId);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [location.hash, plantId, scheduleNavigation]);

  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  return {
    openGroups,
    setGroupOpen,
    revealAndNavigate,
  };
}
