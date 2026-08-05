import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import CultivarPage from "@/pages/CultivarPage";

export const Route = createFileRoute("/cultivars/$slug")({
  head: ({ params }) => staticRouteHead(`/cultivars/${params.slug}`),
  component: RouteComponent,
});

function RouteComponent() {
  return <CultivarPage />;
}
