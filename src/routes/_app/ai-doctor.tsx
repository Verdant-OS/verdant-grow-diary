import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/_app/ai-doctor")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/doctor" />;
}
