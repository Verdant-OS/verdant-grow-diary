import { createFileRoute } from "@tanstack/react-router";
import OperatorEcowittCanary from "@/pages/OperatorEcowittCanary";

export const Route = createFileRoute("/_app/_operator/operator/ecowitt")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEcowittCanary />;
}
