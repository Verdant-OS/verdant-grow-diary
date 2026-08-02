import { createFileRoute } from "@tanstack/react-router";
import OperatorPaddleProcessingAudit from "@/pages/OperatorPaddleProcessingAudit";

export const Route = createFileRoute("/operator/paddle-processing-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorPaddleProcessingAudit />;
}
