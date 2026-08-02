import { createFileRoute } from "@tanstack/react-router";
import CheckoutCancel from "@/pages/CheckoutCancel";

export const Route = createFileRoute("/checkout/cancel")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CheckoutCancel />;
}
