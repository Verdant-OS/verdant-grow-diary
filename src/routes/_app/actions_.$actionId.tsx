import { createFileRoute } from "@tanstack/react-router";
import ActionDetail from "@/pages/ActionDetail";

export const Route = createFileRoute("/_app/actions_/$actionId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ActionDetail />;
}
