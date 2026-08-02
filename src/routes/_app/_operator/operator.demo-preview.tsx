import { createFileRoute } from "@tanstack/react-router";
import OperatorDemoPreview from "@/pages/OperatorDemoPreview";

export const Route = createFileRoute("/_app/_operator/operator/demo-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorDemoPreview />;
}
