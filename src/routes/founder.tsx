import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/founder")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/pricing" />;
}
