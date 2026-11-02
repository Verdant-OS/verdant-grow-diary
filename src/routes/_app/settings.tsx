import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Account and subscription settings | Verdant Grow Diary" },
      {
        name: "description",
        content: "Review your Verdant account, saved subscription and preferences.",
      },
      { property: "og:title", content: "Verdant account and subscription settings" },
      { property: "og:description", content: "Review your account, subscription and preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <Settings />;
}
