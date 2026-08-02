import { createFileRoute } from "@tanstack/react-router";
import Timeline from "@/pages/Timeline";

export const Route = createFileRoute("/timeline")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Timeline />;
}
