import { createFileRoute } from "@tanstack/react-router";
import GuidesIndex from "@/pages/GuidesIndex";

export const Route = createFileRoute("/guides")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GuidesIndex />;
}
