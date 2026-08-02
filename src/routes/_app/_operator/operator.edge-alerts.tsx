import { createFileRoute } from "@tanstack/react-router";
import OperatorEdgeAlerts from "@/pages/OperatorEdgeAlerts";

export const Route = createFileRoute("/operator/edge-alerts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEdgeAlerts />;
}
