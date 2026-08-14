import { createFileRoute } from "@tanstack/react-router";
import AnalyticsConsentSettings from "@/pages/AnalyticsConsentSettings";

export const Route = createFileRoute("/_app/settings_/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics consent — Verdant Grow Diary" },
      {
        name: "description",
        content:
          "View, grant, or revoke your analytics consent for Verdant Grow Diary. Stored in your browser; grow data is never sent to analytics.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Analytics consent — Verdant Grow Diary" },
      {
        property: "og:description",
        content: "Grant or revoke analytics consent for Verdant Grow Diary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <AnalyticsConsentSettings />;
}
