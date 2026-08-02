import { createFileRoute } from "@tanstack/react-router";
import OperatorEdgeMetrics from "@/pages/OperatorEdgeMetrics";

export const Route = createFileRoute("/operator/edge-metrics")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEdgeMetrics />;
}
