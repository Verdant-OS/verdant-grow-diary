import { createFileRoute } from "@tanstack/react-router";
import HealthCheck from "@/pages/HealthCheck";

export const Route = createFileRoute("/_app/health")({
  component: RouteComponent,
});

function RouteComponent() {
  return <HealthCheck />;
}
