import { createFileRoute } from "@tanstack/react-router";
import RootEntry from "@/components/RootEntry";
import { PublicAuthProviders } from "@/components/providers/PublicAuthProviders";

const SITE_URL = "https://verdantgrowdiary.com";

export const Route = createFileRoute("/")({
  // Canonical is per-route (the root route can't own it without shadowing
  // every leaf), so the homepage declares its own here.
  head: () => ({
    links: [{ rel: "canonical", href: SITE_URL }],
    meta: [
      { property: "og:image", content: `${SITE_URL}/og/home.png` },
      { name: "twitter:image", content: `${SITE_URL}/og/home.png` },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PublicAuthProviders>
      <RootEntry />
    </PublicAuthProviders>
  );
}
