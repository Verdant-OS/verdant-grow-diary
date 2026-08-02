import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CreatorBeta from "@/pages/CreatorBeta";

export const Route = createFileRoute("/creator-beta")({
  head: () => staticRouteHead("/creator-beta"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CreatorBeta />;
}
