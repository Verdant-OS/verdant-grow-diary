import { createFileRoute } from "@tanstack/react-router";
import OperatorEcowittCanary from "@/pages/OperatorEcowittCanary";

export const Route = createFileRoute("/operator/ecowitt")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEcowittCanary />;
}
