import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/strains/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <LegacyStrainSlugRedirect />;
}
