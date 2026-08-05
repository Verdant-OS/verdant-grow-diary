import { createFileRoute } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/_app/grow-room")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/" />;
}
