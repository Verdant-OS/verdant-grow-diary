import { createFileRoute } from "@tanstack/react-router";
import Feedback from "@/pages/support/Feedback";

export const Route = createFileRoute("/feedback")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Feedback />;
}
