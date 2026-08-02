import { createFileRoute } from "@tanstack/react-router";
import GrowStageCareGuide from "@/pages/GrowStageCareGuide";

export const Route = createFileRoute("/guides/grow-stage-care-guide")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowStageCareGuide />;
}
