import { createFileRoute } from "@tanstack/react-router";
import AiDoctorStart from "@/pages/AiDoctorStart";

export const Route = createFileRoute("/doctor")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorStart />;
}
