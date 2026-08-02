import { createFileRoute } from "@tanstack/react-router";
import CreatorBeta from "@/pages/CreatorBeta";

export const Route = createFileRoute("/creator-beta")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreatorBeta />;
}
