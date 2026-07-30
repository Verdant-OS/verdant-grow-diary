import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function readIsMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(readIsMobile);

  React.useEffect(() => {
    const update = () => setIsMobile(readIsMobile());
    const subscribeToResize = () => {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    };

    update();

    try {
      const mql = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

      if (
        mql &&
        typeof mql.addEventListener === "function" &&
        typeof mql.removeEventListener === "function"
      ) {
        mql.addEventListener("change", update);
        return () => mql.removeEventListener("change", update);
      }

      if (
        mql &&
        typeof mql.addListener === "function" &&
        typeof mql.removeListener === "function"
      ) {
        mql.addListener(update);
        return () => mql.removeListener(update);
      }
    } catch {
      // Older or constrained WebViews can omit or reject matchMedia.
    }

    return subscribeToResize();
  }, []);

  return isMobile;
}
