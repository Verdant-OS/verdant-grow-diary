import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const saveMock = vi.fn();
vi.mock("@/hooks/useSavePhotoDiagnosisReview", () => ({
  useSavePhotoDiagnosisReview: () => ({
    save: saveMock,
    isSaving: false,
  }),
}));

import PhotoDiagnosisReviewDialog from "@/components/PhotoDiagnosisReviewDialog";

const photo = {
  photo_id: "photo-diary-entry-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
};

describe("PhotoDiagnosisReviewDialog", () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  it("shows a clear first-review empty state and the manual safety boundary", () => {
    render(
      <PhotoDiagnosisReviewDialog
        open
        onOpenChange={vi.fn()}
        photo={photo}
        photoDateLabel="Jul 17, 2026"
        existingReview={null}
      />,
    );

    expect(screen.getByTestId("photo-diagnosis-review-empty")).toHaveTextContent(
      /No grower review has been recorded/i,
    );
    expect(screen.getByText(/Grower-authored observation only/i)).toBeInTheDocument();
    expect(screen.getByText(/does not create an AI diagnosis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/What did you notice/i)).toBeInTheDocument();
  });

  it("saves a grower-authored review only after the grower presses save", async () => {
    saveMock.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <PhotoDiagnosisReviewDialog
        open
        onOpenChange={onOpenChange}
        photo={photo}
        existingReview={null}
      />,
    );

    fireEvent.change(screen.getByTestId("photo-diagnosis-review-observation"), {
      target: { value: "New leaves look even today; I will check again tomorrow." },
    });
    fireEvent.click(screen.getByTestId("photo-diagnosis-review-save"));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith({
        photo,
        observation: "New leaves look even today; I will check again tomorrow.",
        reviewStatus: "reviewed",
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and explains when an observation is missing", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "missing_observation" });
    const onOpenChange = vi.fn();
    render(
      <PhotoDiagnosisReviewDialog
        open
        onOpenChange={onOpenChange}
        photo={photo}
        existingReview={null}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-diagnosis-review-save"));

    expect(await screen.findByTestId("photo-diagnosis-review-error")).toHaveTextContent(
      /Add a short observation/i,
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows the current grower status without calling it a confirmed diagnosis", () => {
    render(
      <PhotoDiagnosisReviewDialog
        open
        onOpenChange={vi.fn()}
        photo={photo}
        existingReview={{
          photoId: "photo-diary-entry-1",
          reviewStatus: "needs_follow_up",
          observation: "Earlier observation.",
          recordedAt: "2026-07-17T15:00:00.000Z",
          diaryEntryId: "review-entry-1",
        }}
      />,
    );

    expect(screen.getByTestId("photo-diagnosis-review-existing")).toHaveTextContent(
      /Current status: Needs follow-up/i,
    );
    expect(screen.queryByText(/confirmed diagnosis/i)).not.toBeInTheDocument();
  });
});
