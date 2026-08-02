import { createFileRoute } from "@tanstack/react-router";
import ActionQueue from "@/pages/ActionQueue";

export const Route = createFileRoute("/_app/actions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ActionQueue />;
}
