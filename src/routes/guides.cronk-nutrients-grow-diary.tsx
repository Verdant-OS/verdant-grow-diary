import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CronkFeedLog from "@/pages/CronkFeedLog";

export const Route = createFileRoute("/guides/cronk-nutrients-grow-diary")({
  head: () => staticRouteHead("/guides/cronk-nutrients-grow-diary"),
  component: RouteComponent,
});

function RouteComponent() {
  return <CronkFeedLog />;
}
