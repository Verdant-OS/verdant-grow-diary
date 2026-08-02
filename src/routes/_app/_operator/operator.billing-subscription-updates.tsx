import { createFileRoute } from "@tanstack/react-router";
import OperatorBillingSubscriptionUpdateAudit from "@/pages/OperatorBillingSubscriptionUpdateAudit";

export const Route = createFileRoute("/operator/billing-subscription-updates")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorBillingSubscriptionUpdateAudit />;
}
