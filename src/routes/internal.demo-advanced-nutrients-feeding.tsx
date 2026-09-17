import { createFileRoute } from "@tanstack/react-router";
import AnVerdantFeedingDemo from "@/pages/AnVerdantFeedingDemo";

export const Route = createFileRoute("/internal/demo-advanced-nutrients-feeding")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return <AnVerdantFeedingDemo />;
}
