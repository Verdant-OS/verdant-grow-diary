import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CheckoutCancel from "@/pages/CheckoutCancel";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/checkout/cancel")({
  head: () => staticRouteHead("/checkout/cancel"),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <CheckoutCancel />
    </PublicAuthProviders>
  );
}
