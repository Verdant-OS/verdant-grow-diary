import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import HardwareIntegrations from "@/pages/HardwareIntegrations";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/hardware-integrations")({
  head: () => staticRouteHead("/hardware-integrations"),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <HardwareIntegrations />
    </PublicAuthProviders>
  );
}
