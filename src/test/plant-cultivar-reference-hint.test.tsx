import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlantCultivarReferenceHint from "@/components/PlantCultivarReferenceHint";

function renderHint(strain: string | null, plantId = "plant-1") {
  return render(
    <MemoryRouter>
      <PlantCultivarReferenceHint strain={strain} plantId={plantId} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* ignore */
  }
});
afterEach(cleanup);

describe("PlantCultivarReferenceHint", () => {
  it("suggests a reference for a confident strain match", () => {
    renderHint("Blue Dream");
    expect(screen.getByTestId("plant-cultivar-hint")).toBeInTheDocument();
    expect(screen.getByTestId("plant-cultivar-hint-link")).toHaveAttribute(
      "href",
      "/cultivars/blue-dream",
    );
  });

  it("renders nothing when the strain does not confidently match", () => {
    renderHint("my mystery bagseed");
    expect(screen.queryByTestId("plant-cultivar-hint")).toBeNull();
  });

  it("renders nothing for an empty strain", () => {
    renderHint(null);
    expect(screen.queryByTestId("plant-cultivar-hint")).toBeNull();
  });

  it("dismisses on 'not the same strain' and stays dismissed", () => {
    const { unmount } = renderHint("GG4", "plant-9");
    fireEvent.click(screen.getByTestId("plant-cultivar-hint-dismiss"));
    expect(screen.queryByTestId("plant-cultivar-hint")).toBeNull();
    unmount();
    // Re-mounting the same plant+match stays dismissed (persisted).
    renderHint("GG4", "plant-9");
    expect(screen.queryByTestId("plant-cultivar-hint")).toBeNull();
  });
});
