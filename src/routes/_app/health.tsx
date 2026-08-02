import { createFileRoute } from "@tanstack/react-router";
import HealthCheck from "@/pages/HealthCheck";

export const Route = createFileRoute("/health")({
  component: RouteComponent,
});

function RouteComponent() {
  return <HealthCheck />;
}
