import { createFileRoute } from "@tanstack/react-router";
import OperatorEdgeMetrics from "@/pages/OperatorEdgeMetrics";

export const Route = createFileRoute("/_app/_operator/operator/edge-metrics")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEdgeMetrics />;
}
