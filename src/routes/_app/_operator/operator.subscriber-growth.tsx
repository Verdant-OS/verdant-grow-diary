import { createFileRoute } from "@tanstack/react-router";
import OperatorSubscriberGrowth from "@/pages/OperatorSubscriberGrowth";

export const Route = createFileRoute("/operator/subscriber-growth")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorSubscriberGrowth />;
}
