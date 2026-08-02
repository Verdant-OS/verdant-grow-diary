import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GuidesIndex from "@/pages/GuidesIndex";

export const Route = createFileRoute("/guides/")({
  head: () => staticRouteHead("/guides"),
  component: RouteComponent,
});

function RouteComponent() {
  return <GuidesIndex />;
}
