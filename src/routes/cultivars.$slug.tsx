import { createFileRoute } from "@tanstack/react-router";
import CultivarPage from "@/pages/CultivarPage";

export const Route = createFileRoute("/cultivars/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CultivarPage />;
}
