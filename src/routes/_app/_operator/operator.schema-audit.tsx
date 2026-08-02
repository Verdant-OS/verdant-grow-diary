import { createFileRoute } from "@tanstack/react-router";
import OperatorSchemaAudit from "@/pages/OperatorSchemaAudit";

export const Route = createFileRoute("/_app/_operator/operator/schema-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorSchemaAudit />;
}
