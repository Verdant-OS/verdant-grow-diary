import { createFileRoute } from "@tanstack/react-router";
import AiDoctorPhase1Preview from "@/pages/AiDoctorPhase1Preview";

export const Route = createFileRoute("/_app/_operator/internal/ai-doctor-phase1-preview")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorPhase1Preview />;
}
