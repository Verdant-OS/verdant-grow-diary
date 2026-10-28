import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import HarvestWindowTracker from "@/pages/HarvestWindowTracker";

export const Route = createFileRoute("/guides/when-to-harvest-cannabis")({
  head: () => staticRouteHead("/guides/when-to-harvest-cannabis"),
  component: RouteComponent,
});

function RouteComponent() {
  return <HarvestWindowTracker />;
}
