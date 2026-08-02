import { createFileRoute } from "@tanstack/react-router";
import OperatorDemoPreview from "@/pages/OperatorDemoPreview";

export const Route = createFileRoute("/operator/demo-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorDemoPreview />;
}
