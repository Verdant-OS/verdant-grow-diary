import { useEffect } from "react";
import { useInRouterContext, useLocation } from "@/lib/react-router-compat";

function RoutedDeepLinkAnchorRestorer({ anchorId }: { anchorId: string }) {
  const location = useLocation();

  useEffect(() => {
    if (location.hash !== `#${anchorId}`) return;
    if (typeof document === "undefined") return;

    const section = document.getElementById(anchorId);
    if (!section) return;

    section.scrollIntoView?.({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
  }, [location.hash, anchorId]);

  return null;
}

/**
 * Re-applies a same-page deep link after asynchronous content mounts.
 *
 * The browser resolves `#anchor` once, at load, against whatever is in the DOM
 * at that moment. Plant Detail's sections mount after their queries settle, so
 * a cross-page link lands before its target exists and the grower ends up at
 * the top of a long page. This re-applies the hash when the target appears.
 *
 * Navigation-only: no data access, no writes. Bare test/preview mounts without
 * a Router stay compatible.
 */
export default function DeepLinkAnchorRestorer({ anchorId }: { anchorId: string }) {
  const isInRouterContext = useInRouterContext();
  return isInRouterContext ? <RoutedDeepLinkAnchorRestorer anchorId={anchorId} /> : null;
}
