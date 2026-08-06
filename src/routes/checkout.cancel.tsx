import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CheckoutCancel from "@/pages/CheckoutCancel";

export const Route = createFileRoute("/checkout/cancel")({
  head: () => staticRouteHead("/checkout/cancel"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CheckoutCancel />;
}
