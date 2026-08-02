import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import AiDoctorContextCheck from "@/pages/AiDoctorContextCheck";

export const Route = createFileRoute("/ai-doctor-readiness-check")({
  head: () => staticRouteHead("/ai-doctor-readiness-check"),
  component: RouteComponent,
});

function RouteComponent() {
  return <AiDoctorContextCheck />;
}
