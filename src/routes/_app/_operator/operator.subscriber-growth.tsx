import { createFileRoute } from "@tanstack/react-router";
import OperatorSubscriberGrowth from "@/pages/OperatorSubscriberGrowth";

export const Route = createFileRoute("/_app/_operator/operator/subscriber-growth")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorSubscriberGrowth />;
}
