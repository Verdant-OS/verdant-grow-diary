import { createFileRoute } from "@tanstack/react-router";
import QuickLogStarter from "@/pages/QuickLogStarter";

export const Route = createFileRoute("/quick-log")({
  component: RouteComponent,
});

function RouteComponent() {
  return <QuickLogStarter />;
}
