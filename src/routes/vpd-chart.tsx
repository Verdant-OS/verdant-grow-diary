import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import PublicVpdChart from "@/pages/PublicVpdChart";

export const Route = createFileRoute("/vpd-chart")({
  head: () => staticRouteHead("/vpd-chart"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicVpdChart />;
}
