import { createFileRoute } from "@tanstack/react-router";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

export const Route = createFileRoute("/doctor/sessions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorSessionsIndex />;
}
