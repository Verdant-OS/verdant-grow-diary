import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { ISOLATE_MALE_GUIDE } from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

export const Route = createFileRoute("/guides/isolate-male-cannabis-plant")({
  head: () => staticRouteHead("/guides/isolate-male-cannabis-plant"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicGrowGuideArticle guide={ISOLATE_MALE_GUIDE} />;
}
