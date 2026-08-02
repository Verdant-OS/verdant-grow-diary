import { createFileRoute } from "@tanstack/react-router";
import Refund from "@/pages/RefundPolicy";

export const Route = createFileRoute("/refund")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Refund />;
}
