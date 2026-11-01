import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { STEADY_CLIMATE_GUIDE } from "@/lib/publicGrowGuideArticles";
import PublicGrowGuideArticle from "@/pages/PublicGrowGuideArticle";

export const Route = createFileRoute("/guides/steady-climate-multiple-grow-tents")({
  head: () => staticRouteHead("/guides/steady-climate-multiple-grow-tents"),
  component: RouteComponent,
});

function RouteComponent() {
  return <PublicGrowGuideArticle guide={STEADY_CLIMATE_GUIDE} />;
}
