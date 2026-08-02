import { createFileRoute } from "@tanstack/react-router";
import { OperatorAiDoctorPhase1Page as OperatorAiDoctorPhase1Page } from "@/pages/OperatorAiDoctorPhase1";

export const Route = createFileRoute("/_app/_operator/operator/ai-doctor-phase1")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OperatorAiDoctorPhase1Page />;
}
