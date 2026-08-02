import { createFileRoute } from "@tanstack/react-router";
import StartYourRoom from "@/pages/StartYourRoom";

export const Route = createFileRoute("/_app/start-room")({
  component: RouteComponent,
});

function RouteComponent() {
  return <StartYourRoom />;
}
