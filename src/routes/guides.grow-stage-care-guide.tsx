import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GrowStageCareGuide from "@/pages/GrowStageCareGuide";

export const Route = createFileRoute("/guides/grow-stage-care-guide")({
  head: () => staticRouteHead("/guides/grow-stage-care-guide"),
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowStageCareGuide />;
}
