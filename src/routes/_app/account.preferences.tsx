import { createFileRoute } from "@tanstack/react-router";
import AccountPreferences from "@/pages/AccountPreferences";

export const Route = createFileRoute("/account/preferences")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AccountPreferences />;
}
