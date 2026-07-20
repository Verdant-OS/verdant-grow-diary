/**
 * StructuredWateringEntry — composes the existing canonical watering writer.
 * Proves: manual-only (never live), review reflects input, save calls the
 * canonical writer once with the built payload, and a retry reuses the SAME
 * idempotency key so it can never double-write.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StructuredWateringEntry } from "@/components/irrigation/StructuredWateringEntry";
import type { WriteWateringTypedEventResult } from "@/lib/writeQuickLogWateringTypedEvent";

const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";

function typeVolume(value: string) {
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value } });
}

describe("StructuredWateringEntry", () => {
  it("is a manual record and never labels itself live", () => {
    render(<StructuredWateringEntry growId={GROW} tentId={TENT} writer={vi.fn()} />);
    expect(screen.getByTestId("watering-source-manual").textContent).toBe("Manual record");
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("previews only entered measurements and needs a volume first", () => {
    render(<StructuredWateringEntry growId={GROW} writer={vi.fn()} />);
    expect(screen.getByTestId("watering-review-needs-input")).toBeTruthy();
    typeVolume("1000");
    fireEvent.change(screen.getByLabelText("Input EC (mS/cm)"), { target: { value: "1.8" } });
    expect(screen.queryByTestId("watering-review-needs-input")).toBeNull();
    const review = screen.getByTestId("watering-review");
    expect(review.textContent).toContain("Applied volume (ml)");
    expect(review.textContent).toContain("Input EC (mS/cm)");
    // never µS/cm
    expect(review.textContent).not.toContain("µS/cm");
  });

  it("calls the canonical writer once with the built payload and shows saved", async () => {
    const writer = vi
      .fn<(arg: unknown) => Promise<WriteWateringTypedEventResult>>()
      .mockResolvedValue({ ok: true, eventId: "evt-1", reused: false });
    const onSaved = vi.fn();
    render(
      <StructuredWateringEntry
        growId={GROW}
        tentId={TENT}
        writer={writer as never}
        onSaved={onSaved}
      />,
    );
    typeVolume("1250");
    fireEvent.click(screen.getByRole("button", { name: /save watering record/i }));
    await waitFor(() => expect(screen.getByTestId("watering-saved")).toBeTruthy());
    expect(writer).toHaveBeenCalledTimes(1);
    const payload = writer.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW);
    expect(payload.tent_id).toBe(TENT);
    expect(payload.volume_ml).toBe(1250);
    expect(typeof payload.idempotency_key).toBe("string");
    expect(onSaved).toHaveBeenCalledWith("evt-1");
  });

  it("retry reuses the same idempotency key (no double-write)", async () => {
    const results: WriteWateringTypedEventResult[] = [
      { ok: false, reason: "rpc:error" },
      { ok: true, eventId: "evt-2", reused: true },
    ];
    const writer = vi.fn<(arg: unknown) => Promise<WriteWateringTypedEventResult>>(() =>
      Promise.resolve(results.shift()!),
    );
    render(<StructuredWateringEntry growId={GROW} writer={writer as never} />);
    typeVolume("900");
    fireEvent.click(screen.getByRole("button", { name: /save watering record/i }));
    await waitFor(() => expect(screen.getByTestId("watering-failed")).toBeTruthy());
    fireEvent.click(screen.getByTestId("watering-retry"));
    await waitFor(() => expect(screen.getByTestId("watering-saved")).toBeTruthy());
    expect(writer).toHaveBeenCalledTimes(2);
    const k1 = (writer.mock.calls[0][0] as Record<string, unknown>).idempotency_key;
    const k2 = (writer.mock.calls[1][0] as Record<string, unknown>).idempotency_key;
    expect(k1).toBe(k2);
  });

  it("blank optional fields stay unknown (never coerced to zero)", async () => {
    const writer = vi
      .fn<(arg: unknown) => Promise<WriteWateringTypedEventResult>>()
      .mockResolvedValue({ ok: true, eventId: "evt-3", reused: false });
    render(<StructuredWateringEntry growId={GROW} writer={writer as never} />);
    typeVolume("500");
    fireEvent.click(screen.getByRole("button", { name: /save watering record/i }));
    await waitFor(() => expect(writer).toHaveBeenCalled());
    const payload = writer.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.volume_ml).toBe(500);
    expect("ph" in payload).toBe(false); // omitted, not 0
    expect("ec_ms_cm" in payload).toBe(false);
  });
});
