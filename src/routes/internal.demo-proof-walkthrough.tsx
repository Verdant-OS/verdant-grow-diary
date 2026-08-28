import { createFileRoute } from "@tanstack/react-router";
import DemoProofWalkthrough from "@/pages/DemoProofWalkthrough";

export const Route = createFileRoute("/internal/demo-proof-walkthrough")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <DemoProofWalkthrough />;
}
