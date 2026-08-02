import { createFileRoute } from "@tanstack/react-router";
import ReleaseReadiness from "@/pages/ReleaseReadiness";

export const Route = createFileRoute("/operator/release-readiness")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ReleaseReadiness />;
}
