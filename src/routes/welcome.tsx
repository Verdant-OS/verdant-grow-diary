import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Welcome from "@/pages/Welcome";

export const Route = createFileRoute("/welcome")({
  head: () => staticRouteHead("/welcome"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Welcome />;
}
