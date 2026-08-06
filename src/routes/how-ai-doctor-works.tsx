import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import HowAiDoctorWorks from "@/pages/HowAiDoctorWorks";

export const Route = createFileRoute("/how-ai-doctor-works")({
  head: () => staticRouteHead("/how-ai-doctor-works"),
  component: RouteComponent,
});

function RouteComponent() {
  return <HowAiDoctorWorks />;
}
