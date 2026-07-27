import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import StartBreedingLogButton from "@/components/StartBreedingLogButton";
import { APP_ROUTES } from "@/lib/appRouteManifest";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const ROOT = resolve(__dirname, "../..");
const APP_SOURCE = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const BUTTON_SOURCE = readFileSync(
  resolve(ROOT, "src/components/StartBreedingLogButton.tsx"),
  "utf8",
);

function LocationProbe() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  return (
    <output
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-grow-id={params.get("growId") ?? ""}
      data-tent-id={params.get("tentId") ?? ""}
    />
  );
}

describe("breeding canonical routes", () => {
  it("keeps program creation and event logging mounted at distinct App routes", () => {
    expect(APP_SOURCE).toMatch(
      /<Route\s+path="\/breeding\/new"\s+element=\{<BreedingProgramNew\s*\/>\}\s*\/>/,
    );
    expect(APP_SOURCE).toMatch(
      /<Route\s+path="\/breeding\/log\/new"\s+element=\{<BreedingLogNew\s*\/>\}\s*\/>/,
    );
  });

  it("describes both canonical routes independently in the route manifest", () => {
    expect(APP_ROUTES.find((route) => route.path === "/breeding/new")).toMatchObject({
      access: "auth",
      description: "Create a new breeding program.",
    });
    expect(APP_ROUTES.find((route) => route.path === "/breeding/log/new")).toMatchObject({
      access: "auth",
      description: "Log a grow-scoped breeding event.",
    });
  });

  it("routes the authenticated logging CTA to the event page and preserves encoded scope", () => {
    render(
      <MemoryRouter initialEntries={["/grows/current"]}>
        <StartBreedingLogButton growId="grow / 1" tentId="tent?2" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Log Breeding Event" }));

    expect(screen.getByTestId("location-probe")).toHaveAttribute(
      "data-pathname",
      "/breeding/log/new",
    );
    expect(screen.getByTestId("location-probe")).toHaveAttribute("data-grow-id", "grow / 1");
    expect(screen.getByTestId("location-probe")).toHaveAttribute("data-tent-id", "tent?2");
  });

  it("builds the logging destination through the shared route helper", () => {
    expect(BUTTON_SOURCE).toMatch(
      /import\s+\{\s*breedingLogNewPath\s*\}\s+from\s+"@\/lib\/routes"/,
    );
    expect(BUTTON_SOURCE).toMatch(/const href = breedingLogNewPath\(growId,\s*tentId\)/);
  });
});
