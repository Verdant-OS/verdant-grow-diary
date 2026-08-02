import { createFileRoute } from "@tanstack/react-router";
import HowAiDoctorWorks from "@/pages/HowAiDoctorWorks";

export const Route = createFileRoute("/how-ai-doctor-works")({
  component: RouteComponent,
});

function RouteComponent() {
  return <HowAiDoctorWorks />;
}
