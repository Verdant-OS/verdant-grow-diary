import { createFileRoute } from "@tanstack/react-router";
import OperatorSupportInbox from "@/pages/OperatorSupportInbox";

export const Route = createFileRoute("/_app/_operator/operator/support-inbox")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorSupportInbox />;
}
