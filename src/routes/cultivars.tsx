import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CultivarsIndex from "@/pages/CultivarsIndex";

export const Route = createFileRoute("/cultivars")({
  head: () => staticRouteHead("/cultivars"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CultivarsIndex />;
}
