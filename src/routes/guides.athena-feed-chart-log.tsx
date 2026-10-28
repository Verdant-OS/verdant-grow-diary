import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import AthenaFeedLog from "@/pages/AthenaFeedLog";

export const Route = createFileRoute("/guides/athena-feed-chart-log")({
  head: () => staticRouteHead("/guides/athena-feed-chart-log"),
  component: RouteComponent,
});

function RouteComponent() {
  return <AthenaFeedLog />;
}
