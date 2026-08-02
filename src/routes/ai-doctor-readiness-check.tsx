import { createFileRoute } from "@tanstack/react-router";
import AiDoctorContextCheck from "@/pages/AiDoctorContextCheck";

export const Route = createFileRoute("/ai-doctor-readiness-check")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorContextCheck />;
}
