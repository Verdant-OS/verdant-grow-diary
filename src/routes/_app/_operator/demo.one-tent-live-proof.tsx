import { createFileRoute } from "@tanstack/react-router";
import OneTentLiveProof from "@/pages/OneTentLiveProof";

export const Route = createFileRoute("/demo/one-tent-live-proof")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneTentLiveProof />;
}
