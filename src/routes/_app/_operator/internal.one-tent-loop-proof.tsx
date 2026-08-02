import { createFileRoute } from "@tanstack/react-router";
import OneTentLoopProof from "@/pages/OneTentLoopProof";

export const Route = createFileRoute("/internal/one-tent-loop-proof")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneTentLoopProof />;
}
