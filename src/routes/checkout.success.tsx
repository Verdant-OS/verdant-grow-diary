import { createFileRoute } from "@tanstack/react-router";
import CheckoutSuccess from "@/pages/CheckoutSuccess";

export const Route = createFileRoute("/checkout/success")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CheckoutSuccess />;
}
