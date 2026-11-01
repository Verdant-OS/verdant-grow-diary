import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { TISSUE_CULTURE_GUIDE } from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

export const Route = createFileRoute("/guides/cannabis-tissue-culture")({
  head: () => staticRouteHead("/guides/cannabis-tissue-culture"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicGrowGuideArticle guide={TISSUE_CULTURE_GUIDE} />;
}
