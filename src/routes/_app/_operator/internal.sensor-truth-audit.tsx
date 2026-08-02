import { createFileRoute } from "@tanstack/react-router";
import SensorTruthAudit from "@/pages/SensorTruthAudit";

export const Route = createFileRoute("/internal/sensor-truth-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SensorTruthAudit />;
}
