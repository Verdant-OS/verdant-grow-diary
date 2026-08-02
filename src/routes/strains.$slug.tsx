import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import LegacyStrainSlugRedirect from "@/components/LegacyStrainSlugRedirect";

export const Route = createFileRoute("/strains/$slug")({
  head: ({ params }) => staticRouteHead(`/strains/${params.slug}`),
  component: RouteComponent,
});

function RouteComponent() {
  return <LegacyStrainSlugRedirect />;
}
