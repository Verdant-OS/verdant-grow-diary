import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";

afterEach(cleanup);

describe("GlobalFastAddButton production truth", () => {
  it("does not expose the demo-only HyperLog prototype in the authenticated Quick Log menu", () => {
    render(
      <MemoryRouter>
        <GlobalFastAddButton
          context={{
            plantId: "plant-1",
            plantName: "Plant 1",
            growId: "grow-1",
            tentId: "tent-1",
            tentName: "Tent 1",
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));

    expect(screen.queryByTestId("global-fast-add-hyperlog-section")).not.toBeInTheDocument();
    expect(screen.queryByText(/hyperlog/i)).not.toBeInTheDocument();
  });

  it("does not bundle the demo HyperLog modal into the production global entry point", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/GlobalFastAddButton.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/HyperLog|hyperLog|HYPERLOG/);
  });
});
