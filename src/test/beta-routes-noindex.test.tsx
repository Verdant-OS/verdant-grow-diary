/**
 * Owner decision 2026-10-26: hide /creator-beta and /breeder-beta from search.
 * Asserts the hydrated head, which can overwrite the static route head.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import BreederBeta from "@/pages/BreederBeta";
import CreatorBeta from "@/pages/CreatorBeta";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("meta[name='robots'], link[rel='canonical']").forEach((node) => {
    node.remove();
  });
});

function robotsContent(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

describe("beta routes stay noindex after hydration", () => {
  it("CreatorBeta emits noindex, follow and a self-canonical", async () => {
    render(
      <MemoryRouter>
        <CreatorBeta />
      </MemoryRouter>,
    );
    await waitFor(() => expect(robotsContent()).toBe("noindex, follow"));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://verdantgrowdiary.com/creator-beta",
    );
  });

  it("BreederBeta emits noindex, follow and canonicalises to /creator-beta", async () => {
    render(
      <MemoryRouter>
        <BreederBeta />
      </MemoryRouter>,
    );
    await waitFor(() => expect(robotsContent()).toBe("noindex, follow"));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://verdantgrowdiary.com/creator-beta",
    );
  });
});
