import { createFileRoute } from "@tanstack/react-router";
import LightingMeasurementReadiness from "@/pages/LightingMeasurementReadiness";

export const Route = createFileRoute("/_app/_operator/diagnostics-lighting-measurement")({
  head: () => ({
    meta: [
      { title: "Lighting measurement readiness | Verdant Grow Diary" },
      {
        name: "description",
        content:
          "Operator readiness for the two lighting launch guides: technical readout, GA4/GSC verified stamps, and PDF export.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <LightingMeasurementReadiness />;
}
