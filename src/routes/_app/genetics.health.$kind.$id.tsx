import { createFileRoute } from "@tanstack/react-router";
import ScreeningQuarantineHistory from "@/pages/ScreeningQuarantineHistory";

export const Route = createFileRoute("/genetics/health/$kind/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ScreeningQuarantineHistory />;
}
