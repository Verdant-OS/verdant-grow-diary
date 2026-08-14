import { createFileRoute } from "@tanstack/react-router";
import AlertDetail from "@/pages/AlertDetail";

export const Route = createFileRoute("/_app/alerts_/$alertId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AlertDetail />;
}
