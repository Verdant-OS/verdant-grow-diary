import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GuidePage from "@/pages/GuidePage";

export const Route = createFileRoute("/guides/$slug")({
  head: ({ params }) => staticRouteHead(`/guides/${params.slug}`),
  component: RouteComponent,
});

function RouteComponent() {
  return <GuidePage />;
}
