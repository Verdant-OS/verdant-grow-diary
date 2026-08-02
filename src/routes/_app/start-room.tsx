import { createFileRoute } from "@tanstack/react-router";
import StartYourRoom from "@/pages/StartYourRoom";

export const Route = createFileRoute("/start-room")({
  component: RouteComponent,
});

function RouteComponent() {
  return <StartYourRoom />;
}
