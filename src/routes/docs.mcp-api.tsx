import { createFileRoute } from "@tanstack/react-router";
import McpApiReference from "@/pages/McpApiReference";

export const Route = createFileRoute("/docs/mcp-api")({
  component: RouteComponent,
});

function RouteComponent() {
  return <McpApiReference />;
}
