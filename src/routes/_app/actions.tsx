import { createFileRoute } from "@tanstack/react-router";
import ActionQueue from "@/pages/ActionQueue";

export const Route = createFileRoute("/actions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ActionQueue />;
}
