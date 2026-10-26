import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import PublicFeedLog from "@/pages/PublicFeedLog";

export const Route = createFileRoute("/guides/advanced-nutrients-feeding-chart-log")({
  head: () => staticRouteHead("/guides/advanced-nutrients-feeding-chart-log"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicFeedLog />;
}
