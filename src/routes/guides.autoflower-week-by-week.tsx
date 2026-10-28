import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import AutoflowerWeekByWeek from "@/pages/AutoflowerWeekByWeek";

export const Route = createFileRoute("/guides/autoflower-week-by-week")({
  head: () => staticRouteHead("/guides/autoflower-week-by-week"),
  component: RouteComponent,
});

function RouteComponent() {
  return <AutoflowerWeekByWeek />;
}
