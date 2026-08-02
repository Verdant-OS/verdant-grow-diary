import { createFileRoute } from "@tanstack/react-router";
import GuidePage from "@/pages/GuidePage";

export const Route = createFileRoute("/guides/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GuidePage />;
}
