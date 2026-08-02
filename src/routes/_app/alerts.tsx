import { createFileRoute } from "@tanstack/react-router";
import Alerts from "@/pages/Alerts";

export const Route = createFileRoute("/_app/alerts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Alerts />;
}
