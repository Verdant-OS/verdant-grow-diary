import { createFileRoute } from "@tanstack/react-router";
import EcowittBridgeDebug from "@/pages/EcowittBridgeDebug";

export const Route = createFileRoute("/operator/ecowitt-bridge-debug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EcowittBridgeDebug />;
}
