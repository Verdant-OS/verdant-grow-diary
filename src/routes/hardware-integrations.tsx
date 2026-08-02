import { createFileRoute } from "@tanstack/react-router";
import HardwareIntegrations from "@/pages/HardwareIntegrations";

export const Route = createFileRoute("/hardware-integrations")({
  component: RouteComponent,
});

function RouteComponent() {
  return <HardwareIntegrations />;
}
