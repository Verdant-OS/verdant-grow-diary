import { createFileRoute } from "@tanstack/react-router";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";

export const Route = createFileRoute("/_app/doctor/sessions/$sessionId")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorSessionDetail />;
}
