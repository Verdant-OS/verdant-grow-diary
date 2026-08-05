import { createFileRoute } from "@tanstack/react-router";
import EcowittBridgeDebug from "@/pages/EcowittBridgeDebug";

export const Route = createFileRoute("/_app/_operator/operator/ecowitt-bridge-debug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EcowittBridgeDebug />;
}
