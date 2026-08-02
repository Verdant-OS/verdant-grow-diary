import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import McpApiReference from "@/pages/McpApiReference";

export const Route = createFileRoute("/docs/mcp-api")({
  head: () => staticRouteHead("/docs/mcp-api"),
  component: RouteComponent,
});

function RouteComponent() {
  return <McpApiReference />;
}
