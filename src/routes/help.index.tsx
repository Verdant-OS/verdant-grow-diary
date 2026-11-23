import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import HelpCenterPage from "@/pages/HelpCenterPage";
import { HelpCenterContent } from "@/lib/helpCenterContent";

export const Route = createFileRoute("/help/")({
  head: () => staticRouteHead(HelpCenterContent.homePath()),
  component: function HelpHomeRoute() {
    return <HelpCenterPage section={null} />;
  },
});
