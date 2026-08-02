import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Refund from "@/pages/RefundPolicy";

export const Route = createFileRoute("/refund")({
  head: () => staticRouteHead("/refund"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Refund />;
}
