import { createFileRoute } from "@tanstack/react-router";
import Unsubscribe from "@/pages/Unsubscribe";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({ meta: [
    { title: "Email preferences | Verdant Grow Diary" },
    { name: "description", content: "Confirm your Verdant email preferences." },
    { property: "og:title", content: "Verdant email preferences" },
    { property: "og:description", content: "Confirm your Verdant email preferences." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: RouteComponent,
});

function RouteComponent() {
  return <Unsubscribe />;
}
