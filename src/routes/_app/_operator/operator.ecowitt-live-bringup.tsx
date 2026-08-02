import { createFileRoute } from "@tanstack/react-router";
import EcowittLiveBringup from "@/pages/EcowittLiveBringup";

export const Route = createFileRoute("/operator/ecowitt-live-bringup")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EcowittLiveBringup />;
}
