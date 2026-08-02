import { createFileRoute } from "@tanstack/react-router";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

export const Route = createFileRoute("/_app/doctor/sessions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorSessionsIndex />;
}
