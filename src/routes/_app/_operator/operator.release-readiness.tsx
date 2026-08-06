import { createFileRoute } from "@tanstack/react-router";
import ReleaseReadiness from "@/pages/ReleaseReadiness";

export const Route = createFileRoute("/_app/_operator/operator/release-readiness")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ReleaseReadiness />;
}
