import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/pages/Onboarding";

export const Route = createFileRoute("/_app/onboarding")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Onboarding />;
}
