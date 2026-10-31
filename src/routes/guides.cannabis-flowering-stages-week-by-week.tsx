import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CannabisFloweringStagesWeekByWeek from "@/pages/CannabisFloweringStagesWeekByWeek";

export const Route = createFileRoute("/guides/cannabis-flowering-stages-week-by-week")({
  head: () => staticRouteHead("/guides/cannabis-flowering-stages-week-by-week"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CannabisFloweringStagesWeekByWeek />;
}
