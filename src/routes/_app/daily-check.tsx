import { createFileRoute } from "@tanstack/react-router";
import DailyCheck from "@/pages/DailyCheck";

export const Route = createFileRoute("/daily-check")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DailyCheck />;
}
