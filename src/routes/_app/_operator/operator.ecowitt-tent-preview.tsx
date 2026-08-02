import { createFileRoute } from "@tanstack/react-router";
import OperatorEcowittTentPreview from "@/pages/OperatorEcowittTentPreview";

export const Route = createFileRoute("/_app/_operator/operator/ecowitt-tent-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorEcowittTentPreview />;
}
