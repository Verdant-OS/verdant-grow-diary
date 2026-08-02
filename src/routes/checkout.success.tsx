import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CheckoutSuccess from "@/pages/CheckoutSuccess";

export const Route = createFileRoute("/checkout/success")({
  head: () => staticRouteHead("/checkout/success"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CheckoutSuccess />;
}
