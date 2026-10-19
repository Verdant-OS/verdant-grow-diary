import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@/lib/react-router-compat";

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

/** How long a hash landing keeps correcting scroll while async cards above it mount. */
const HASH_SCROLL_FOLLOW_MS = 3000;

function startHashScrollFollow(anchorId: string, onUserInput?: () => void): () => void {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    typeof ResizeObserver === "undefined"
  ) {
    return () => {};
  }

  let stopped = false;
  let observing = true;
  // The landing alignment and each resize correction start a smooth scroll that
  // can still be moving after observation ends. Listeners stay until that scroll
  // finishes (scrollend) or the grower cancels it.
  let scrollInFlight = true;

  const removeInputListeners = () => {
    window.removeEventListener("wheel", stopOnUserInput);
    window.removeEventListener("touchmove", stopOnUserInput);
    window.removeEventListener("touchstart", stopOnUserInput);
    window.removeEventListener("keydown", stopOnUserInput);
    window.removeEventListener("pointerdown", stopOnUserInput);
    window.removeEventListener("scrollend", onScrollFinished);
    document.removeEventListener("scrollend", onScrollFinished);
  };
  const releaseInputListenersIfIdle = () => {
    if (stopped || observing || scrollInFlight) return;
    stopped = true;
    removeInputListeners();
  };
  const endObservation = () => {
    if (!observing) return;
    observing = false;
    observer.disconnect();
    window.clearTimeout(timer);
    releaseInputListenersIfIdle();
  };
  const onScrollFinished = () => {
    scrollInFlight = false;
    releaseInputListenersIfIdle();
  };
  const haltInFlightScroll = () => {
    try {
      window.scrollTo({
        top: window.scrollY,
        left: window.scrollX,
        behavior: "instant" as ScrollBehavior,
      });
    } catch {
      window.scrollTo(window.scrollX, window.scrollY);
    }
  };
  const stopOnUserInput = () => {
    if (stopped) return;
    stopped = true;
    observing = false;
    scrollInFlight = false;
    observer.disconnect();
    window.clearTimeout(timer);
    removeInputListeners();
    onUserInput?.();
    haltInFlightScroll();
  };
  const release = () => {
    if (stopped) return;
    stopped = true;
    observing = false;
    scrollInFlight = false;
    observer.disconnect();
    window.clearTimeout(timer);
    removeInputListeners();
  };

  const observer = new ResizeObserver(() => {
    if (stopped || !observing) return;
    const target = document.getElementById(anchorId);
    if (!target) return;
    scrollInFlight = true;
    safelyFocusAndScroll(target);
  });
  observer.observe(document.documentElement);
  const timer = window.setTimeout(endObservation, HASH_SCROLL_FOLLOW_MS);
  window.addEventListener("wheel", stopOnUserInput, { passive: true });
  window.addEventListener("touchmove", stopOnUserInput, { passive: true });
  window.addEventListener("touchstart", stopOnUserInput, { passive: true });
  window.addEventListener("keydown", stopOnUserInput);
  // Section-nav and quick-action buttons navigate without changing the hash,
  // so a pointer press is the grower taking over from the landing hash.
  window.addEventListener("pointerdown", stopOnUserInput, { passive: true });
  window.addEventListener("scrollend", onScrollFinished);
  document.addEventListener("scrollend", onScrollFinished);
  return release;
}

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
  const stopFollowRef = useRef<(() => void) | null>(null);

  const endHashScrollFollow = useCallback(() => {
    stopFollowRef.current?.();
    stopFollowRef.current = null;
  }, []);

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

  const beginHashScrollFollow = useCallback(
    (anchorId: string) => {
      endHashScrollFollow();
      stopFollowRef.current = startHashScrollFollow(anchorId, cancelPendingFrame);
    },
    [cancelPendingFrame, endHashScrollFollow],
  );

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
      // A new section navigation replaces any landing-hash follow; otherwise a
      // layout change from opening this disclosure would scroll back to the old hash.
      endHashScrollFollow();
      const revealGroup = target.group;
      if (revealGroup) {
        setDisclosureState((current) => {
          const scopeMatches = current.plantId === plantId && current.routeHash === location.hash;
          const currentGroups = scopeMatches
            ? current.openGroups
            : openStateFor(resolvePlantDetailDisclosureTarget(location.hash)?.group ?? null);
          if (scopeMatches && currentGroups[revealGroup]) return current;
          return {
            plantId,
            routeHash: location.hash,
            openGroups: { ...currentGroups, [revealGroup]: true },
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
    [
      endHashScrollFollow,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      plantId,
      scheduleNavigation,
    ],
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
    if (target) {
      scheduleNavigation(target.anchorId);
      beginHashScrollFollow(target.anchorId);
    } else {
      endHashScrollFollow();
    }
    return endHashScrollFollow;
  }, [
    beginHashScrollFollow,
    cancelPendingFrame,
    endHashScrollFollow,
    location.hash,
    plantId,
    scheduleNavigation,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHashChange = () => {
      const target = resolvePlantDetailDisclosureTarget(window.location.hash);
      if (!target) return;
      const hashGroup = target.group;
      if (hashGroup) {
        setDisclosureState((current) => {
          const currentGroups =
            current.plantId === plantId ? current.openGroups : openStateFor(null);
          if (current.plantId === plantId && currentGroups[hashGroup]) return current;
          return {
            plantId,
            routeHash: location.hash,
            openGroups: { ...currentGroups, [hashGroup]: true },
          };
        });
      }
      scheduleNavigation(target.anchorId);
      beginHashScrollFollow(target.anchorId);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [beginHashScrollFollow, location.hash, plantId, scheduleNavigation]);

  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  return {
    openGroups,
    setGroupOpen,
    revealAndNavigate,
  };
}
