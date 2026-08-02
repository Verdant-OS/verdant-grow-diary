import { createFileRoute } from "@tanstack/react-router";
import Alerts from "@/pages/Alerts";

export const Route = createFileRoute("/alerts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Alerts />;
}
