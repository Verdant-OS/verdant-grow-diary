import { createFileRoute } from "@tanstack/react-router";
import Timeline from "@/pages/Timeline";

export const Route = createFileRoute("/_app/timeline")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Timeline />;
}
