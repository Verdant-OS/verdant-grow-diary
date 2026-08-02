import { createFileRoute } from "@tanstack/react-router";
import EcowittBridgeStatus from "@/pages/EcowittBridgeStatus";

export const Route = createFileRoute("/operator/ecowitt-bridge-status")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EcowittBridgeStatus />;
}
