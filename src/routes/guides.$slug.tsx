import { createFileRoute } from "@tanstack/react-router";
import { guideRouteHead } from "@/lib/guideRouteHeadRules";
import GuidePage from "@/pages/GuidePage";

export const Route = createFileRoute("/guides/$slug")({
  head: ({ params }) => guideRouteHead(params.slug),
  component: RouteComponent,
});

function RouteComponent() {
  return <GuidePage />;
}
