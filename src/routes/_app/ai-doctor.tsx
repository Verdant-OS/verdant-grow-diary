import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/ai-doctor")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/doctor" />;
}
