import { createFileRoute } from "@tanstack/react-router";
import OAuthConsent from "@/pages/OAuthConsent";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <OAuthConsent />
    </PublicAuthProviders>
  );
}
