import { createFileRoute } from "@tanstack/react-router";
import OperatorPostGrowReflectionDryRun from "@/pages/OperatorPostGrowReflectionDryRun";

export const Route = createFileRoute("/operator/post-grow-reflection-dry-run")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorPostGrowReflectionDryRun />;
}
