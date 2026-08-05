import { createFileRoute } from "@tanstack/react-router";
import PropagationBatchDetail from "@/pages/PropagationBatchDetail";

export const Route = createFileRoute("/_app/genetics/batches/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PropagationBatchDetail />;
}
