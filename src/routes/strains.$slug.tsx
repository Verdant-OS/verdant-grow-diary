import { createFileRoute } from "@tanstack/react-router";
import LegacyStrainSlugRedirect from "@/components/LegacyStrainSlugRedirect";

export const Route = createFileRoute("/strains/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <LegacyStrainSlugRedirect />;
}
