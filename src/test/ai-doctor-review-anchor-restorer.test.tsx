import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import AiDoctorReviewAnchorRestorer from "@/components/AiDoctorReviewAnchorRestorer";

describe("AiDoctorReviewAnchorRestorer", () => {
  afterEach(() => cleanup());

  it("keeps supported bare mounts safe when no Router exists", () => {
    expect(() => render(<AiDoctorReviewAnchorRestorer />)).not.toThrow();
  });

  it("focuses the asynchronously mounted review anchor without any AI path", async () => {
    render(
      <MemoryRouter initialEntries={["/plants/p1?tentId=t1#plant-ai-doctor-review"]}>
        <section id="plant-ai-doctor-review" tabIndex={-1} data-testid="review-anchor">
          <AiDoctorReviewAnchorRestorer />
        </section>
      </MemoryRouter>,
    );

    const anchor = screen.getByTestId("review-anchor");
    await waitFor(() => expect(document.activeElement).toBe(anchor));
  });
});
