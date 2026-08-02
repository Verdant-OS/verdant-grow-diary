import { createFileRoute } from "@tanstack/react-router";
import OneTentProofRecord from "@/pages/OneTentProofRecord";

export const Route = createFileRoute("/_app/_operator/operator/one-tent-proof-record")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneTentProofRecord />;
}
