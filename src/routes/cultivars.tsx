import { createFileRoute } from "@tanstack/react-router";
import CultivarsIndex from "@/pages/CultivarsIndex";

export const Route = createFileRoute("/cultivars")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CultivarsIndex />;
}
