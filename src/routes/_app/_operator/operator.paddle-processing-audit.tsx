import { createFileRoute } from "@tanstack/react-router";
import OperatorPaddleProcessingAudit from "@/pages/OperatorPaddleProcessingAudit";

export const Route = createFileRoute("/_app/_operator/operator/paddle-processing-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorPaddleProcessingAudit />;
}
