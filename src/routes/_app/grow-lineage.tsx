import { createFileRoute } from "@tanstack/react-router";
import GrowLineageRepair from "@/pages/GrowLineageRepair";

export const Route = createFileRoute("/grow-lineage")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowLineageRepair />;
}
