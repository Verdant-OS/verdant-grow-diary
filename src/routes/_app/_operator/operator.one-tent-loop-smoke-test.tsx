import { createFileRoute } from "@tanstack/react-router";
import OperatorOneTentLoopSmokeTest from "@/pages/OperatorOneTentLoopSmokeTest";

export const Route = createFileRoute("/_app/_operator/operator/one-tent-loop-smoke-test")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorOneTentLoopSmokeTest />;
}
