import { createFileRoute } from "@tanstack/react-router";
import OneTentLoopLiveProof from "@/pages/OneTentLoopLiveProof";

export const Route = createFileRoute("/one-tent-loop-proof")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneTentLoopLiveProof />;
}
