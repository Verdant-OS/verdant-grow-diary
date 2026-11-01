import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { STILL_AIR_BOX_GUIDE } from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

export const Route = createFileRoute("/guides/still-air-box-vs-flow-hood")({
  head: () => staticRouteHead("/guides/still-air-box-vs-flow-hood"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicGrowGuideArticle guide={STILL_AIR_BOX_GUIDE} />;
}
