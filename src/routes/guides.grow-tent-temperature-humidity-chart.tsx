import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GrowTentTemperatureHumidityChart from "@/pages/GrowTentTemperatureHumidityChart";

export const Route = createFileRoute("/guides/grow-tent-temperature-humidity-chart")({
  head: () => staticRouteHead("/guides/grow-tent-temperature-humidity-chart"),
  component: RouteComponent,
});

function RouteComponent() {
  return <GrowTentTemperatureHumidityChart />;
}
