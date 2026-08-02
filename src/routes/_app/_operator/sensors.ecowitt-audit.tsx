import { createFileRoute } from "@tanstack/react-router";
import EcowittIngestAudit from "@/pages/EcowittIngestAudit";

export const Route = createFileRoute("/_app/_operator/sensors/ecowitt-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EcowittIngestAudit />;
}
