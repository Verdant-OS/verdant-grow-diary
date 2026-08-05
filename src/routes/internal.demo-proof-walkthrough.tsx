import { createFileRoute } from "@tanstack/react-router";
import DemoProofWalkthrough from "@/pages/DemoProofWalkthrough";

export const Route = createFileRoute("/internal/demo-proof-walkthrough")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DemoProofWalkthrough />;
}
