import { useEffect } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";

import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

function RoutedAiDoctorReviewAnchorRestorer() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash !== `#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`) return;
    if (typeof document === "undefined") return;

    const section = document.getElementById(PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID);
    if (!section) return;

    section.scrollIntoView?.({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
  }, [location.hash]);

  return null;
}

/**
 * Re-applies the review deep link after asynchronous plant data mounts.
 * Navigation-only: no AI invocation, credit spend, persistence, or writes.
 * Bare test/preview mounts stay compatible when no Router is present.
 */
export default function AiDoctorReviewAnchorRestorer() {
  const isInRouterContext = useInRouterContext();
  return isInRouterContext ? <RoutedAiDoctorReviewAnchorRestorer /> : null;
}
