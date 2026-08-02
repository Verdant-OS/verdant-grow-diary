import { createFileRoute } from "@tanstack/react-router";
import OperatorMode from "@/pages/OperatorMode";

export const Route = createFileRoute("/operator/mode")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorMode />;
}
