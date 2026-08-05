import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Landing from "@/pages/Landing";

export const Route = createFileRoute("/welcome")({
  head: () => staticRouteHead("/welcome"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Landing />;
}
