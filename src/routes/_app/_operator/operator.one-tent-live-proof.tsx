import { createFileRoute } from "@tanstack/react-router";
import OneTentLiveProof from "@/pages/OneTentLiveProof";

export const Route = createFileRoute("/_app/_operator/operator/one-tent-live-proof")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneTentLiveProof />;
}
