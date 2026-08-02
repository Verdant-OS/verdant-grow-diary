import { createFileRoute } from "@tanstack/react-router";
import Founder from "@/pages/Founder";

export const Route = createFileRoute("/founder")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Founder />;
}
