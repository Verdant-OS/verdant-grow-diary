import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import Feedback from "@/pages/support/Feedback";

export const Route = createFileRoute("/feedback")({
  head: () => staticRouteHead("/feedback"),
  component: RouteComponent,
});

function RouteComponent() {
  return <Feedback />;
}
