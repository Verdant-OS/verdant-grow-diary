import { createFileRoute } from "@tanstack/react-router";
import OperatorCreditsAudit from "@/pages/OperatorCreditsAudit";

export const Route = createFileRoute("/operator/credits-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorCreditsAudit />;
}
