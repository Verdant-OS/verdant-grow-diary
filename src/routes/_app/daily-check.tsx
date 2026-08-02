import { createFileRoute } from "@tanstack/react-router";
import DailyCheck from "@/pages/DailyCheck";

export const Route = createFileRoute("/_app/daily-check")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DailyCheck />;
}
