import { createFileRoute } from "@tanstack/react-router";
import OperatorSchemaAudit from "@/pages/OperatorSchemaAudit";

export const Route = createFileRoute("/operator/schema-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorSchemaAudit />;
}
