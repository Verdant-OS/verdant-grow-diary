import { createFileRoute } from "@tanstack/react-router";
import Plants from "@/pages/Plants";

export const Route = createFileRoute("/plants")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Plants />;
}
