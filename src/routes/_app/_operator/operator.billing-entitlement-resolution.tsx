import { createFileRoute } from "@tanstack/react-router";
import OperatorBillingEntitlementResolutionAudit from "@/pages/OperatorBillingEntitlementResolutionAudit";

export const Route = createFileRoute("/operator/billing-entitlement-resolution")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorBillingEntitlementResolutionAudit />;
}
