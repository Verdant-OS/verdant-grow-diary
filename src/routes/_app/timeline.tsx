import { createFileRoute } from "@tanstack/react-router";
import RouteTransitionSkeleton from "@/components/RouteTransitionSkeleton";
import Timeline from "@/pages/Timeline";

export const Route = createFileRoute("/_app/timeline")({
  component: RouteComponent,
  pendingComponent: TimelinePending,
});

function TimelinePending() {
  return <RouteTransitionSkeleton label="Timeline" testId="timeline-route-skeleton" />;
}

function RouteComponent() {
  return <Timeline />;
}
