import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import AutopotStashNutrientsFeedLog from "@/pages/AutopotStashNutrientsFeedLog";

export const Route = createFileRoute("/guides/autopot-stash-nutrients-feed-log")({
  head: () => staticRouteHead("/guides/autopot-stash-nutrients-feed-log"),
  component: RouteComponent,
});

function RouteComponent() {
  return <AutopotStashNutrientsFeedLog />;
}
