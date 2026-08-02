import { createFileRoute } from "@tanstack/react-router";
import SensorTruthAudit from "@/pages/SensorTruthAudit";

export const Route = createFileRoute("/_app/_operator/internal/sensor-truth-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SensorTruthAudit />;
}
