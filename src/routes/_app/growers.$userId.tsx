import { createFileRoute } from "@tanstack/react-router";
import GrowerBadgeProfile from "@/pages/GrowerBadgeProfile";

export const Route = createFileRoute("/_app/growers/$userId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { userId } = Route.useParams();
  return <GrowerBadgeProfile profileUserId={userId} />;
}
