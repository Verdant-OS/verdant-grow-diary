import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/auth")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <Auth />
    </PublicAuthProviders>
  );
}
