import { createFileRoute } from "@tanstack/react-router";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

export const Route = createFileRoute("/_app/doctor_/sessions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorSessionsIndex />;
}
