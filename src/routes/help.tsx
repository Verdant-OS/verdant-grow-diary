import { createFileRoute, redirect } from "@tanstack/react-router";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

export const Route = createFileRoute("/help")({
  // Resolve the public alias before the application shell can render.
  beforeLoad: ({ location }) => {
    const hash = location.hash ? `#${location.hash.replace(/^#/, "")}` : "";
    throw redirect({
      href: `/tools/grow-help-toolkit${location.searchStr}${hash}`,
      replace: true,
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <RouteAliasRedirect to="/tools/grow-help-toolkit" />;
}
