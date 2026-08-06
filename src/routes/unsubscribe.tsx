import { createFileRoute } from "@tanstack/react-router";
import Unsubscribe from "@/pages/Unsubscribe";

export const Route = createFileRoute("/unsubscribe")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Unsubscribe />;
}
