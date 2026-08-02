import { createFileRoute } from "@tanstack/react-router";
import AiDoctorConfidenceAudit from "@/pages/AiDoctorConfidenceAudit";

export const Route = createFileRoute("/internal/ai-doctor-confidence-audit")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorConfidenceAudit />;
}
