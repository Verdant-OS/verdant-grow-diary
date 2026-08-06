import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/refund-policy")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/refund" />;
}
