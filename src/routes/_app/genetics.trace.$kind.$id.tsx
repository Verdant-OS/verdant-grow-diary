import { createFileRoute } from "@tanstack/react-router";
import TraceabilityView from "@/pages/TraceabilityView";

export const Route = createFileRoute("/_app/genetics/trace/$kind/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <TraceabilityView />;
}
