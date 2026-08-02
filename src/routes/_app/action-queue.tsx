import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/action-queue")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/actions" />;
}
