/**
 * Integration tests for Verdant Quick Log Activity Types v1a.next —
 * QuickLogAllActivitiesSection.
 *
 * Proves end-to-end that every supported v1a activity:
 *  - renders via shared QuickLogActivityPicker (no duplicate taxonomy)
 *  - routes saves through the shared useQuickLogActivitySave hook
 *  - dispatches verdant:entry-created only on confirmed success
 *  - appears in the local "What was saved" breakdown only on success
 *  - Harvest saves only when the selected plant stage is eligible
 *  - failed saves do not dispatch and do not add saved items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "@/lib/react-router-compat";

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_ACTIVITY_DEFINITIONS } from "@/constants/quickLogActivityTypes";
import { QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY } from "@/lib/quickLogPhotoAttachmentRecovery";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import {
  saveTemperatureUnitPreference,
  clearTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import { STAGES } from "@/lib/grow";

const rpcMock = vi.fn();
// Photo activity goes diary-only: storage upload + diary_entries insert.
const storageUploadMock = vi.fn(async (..._args: unknown[]) => ({
  data: { path: "p" } as { path: string } | null,
  error: null as { message: string } | null,
}));
const storageRemoveMock = vi.fn(async (..._args: unknown[]) => ({ data: null, error: null }));
const diaryInsertMock = vi.fn(async (..._args: unknown[]) => ({ error: null }));
const diaryMaybeSingleMock = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({
  data: null,
  error: null,
}));
const diaryOwnerEqMock = vi.fn(() => ({ maybeSingle: diaryMaybeSingleMock }));
const diaryIdEqMock = vi.fn(() => ({ eq: diaryOwnerEqMock }));
const diarySelectMock = vi.fn((..._args: unknown[]) => ({ eq: diaryIdEqMock }));
const trackQuickLogSuccessMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: (bucket: string) => ({
        upload: (...args: unknown[]) => storageUploadMock(bucket, ...(args as [])),
        remove: (...args: unknown[]) => storageRemoveMock(bucket, ...(args as [])),
      }),
    },
    from: (table: string) => ({
      insert: (...args: unknown[]) => diaryInsertMock(table, ...(args as [])),
      select: (...args: unknown[]) => diarySelectMock(table, ...(args as [])),
    }),
  },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: (...args: unknown[]) => trackQuickLogSuccessMock(...args),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

const GROW = "grow-1";
const TENT = "tent-1";
const PLANT = "plant-1";
const OTHER_PLANT = "plant-2";

function mountSection(props?: Partial<React.ComponentProps<typeof QuickLogAllActivitiesSection>>) {
  return render(
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId={GROW}
        tentId={TENT}
        plantId={PLANT}
        plantStage="flower"
        {...props}
      />
    </MemoryRouter>,
  );
}

function revealAdditionalActivities() {
  const disclosure = screen.getByRole("button", {
    name: "More activity types",
  });
  if (disclosure.getAttribute("aria-expanded") === "false") {
    fireEvent.click(disclosure);
  }
}

function selectActivity(activityId: string) {
  const testId = `quick-log-all-activities-picker-${activityId}`;
  if (!screen.queryByTestId(testId)) revealAdditionalActivities();
  fireEvent.click(screen.getByTestId(testId));
}

function listenForEntryCreated() {
  const evts: CustomEvent[] = [];
  const handler = (e: Event) => evts.push(e as CustomEvent);
  window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  return {
    events: evts,
    dispose: () => window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler),
  };
}

async function saveWithNote(activityId: string, note = "  short observation  ") {
  selectActivity(activityId);
  await screen.findByTestId("quick-log-all-activities-form");
  const textarea = screen.queryByTestId("quick-log-all-activities-note");
  if (textarea) fireEvent.change(textarea, { target: { value: note } });
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

async function saveWithoutNote(activityId: string) {
  selectActivity(activityId);
  await screen.findByTestId("quick-log-all-activities-form");
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

beforeEach(() => {
  // Recovery fences are intentionally browser-session durable. Keep each
  // integration case isolated while exercising the real remount behavior.
  window.sessionStorage.removeItem(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY);
  rpcMock.mockReset();
  storageUploadMock.mockClear();
  storageUploadMock.mockImplementation(async (..._args: unknown[]) => ({
    data: { path: "p" },
    error: null,
  }));
  storageRemoveMock.mockClear();
  diaryInsertMock.mockClear();
  diarySelectMock.mockClear();
  diaryIdEqMock.mockClear();
  diaryOwnerEqMock.mockClear();
  diaryMaybeSingleMock.mockClear();
  trackQuickLogSuccessMock.mockReset();
  diaryInsertMock.mockImplementation(async (..._args: unknown[]) => ({ error: null }));
  diaryMaybeSingleMock.mockImplementation(async () => ({ data: null, error: null }));
});

describe("QuickLogAllActivitiesSection — shared taxonomy", () => {
  it("keeps the Symptom Check launcher wrap-safe at 320px without changing the shared Button", () => {
    mountSection();
    const launcher = screen.getByTestId("quick-log-all-activities-start-symptom-check");
    expect(launcher).toHaveClass("h-auto", "whitespace-normal", "text-left");
    expect(launcher.querySelector(".min-w-0")).not.toBeNull();
  });

  it("requires a selected plant for Symptom Check without blocking the plant-scoped launcher", () => {
    const missingPlant = mountSection({ plantId: null });
    const blockedLauncher = screen.getByTestId("quick-log-all-activities-start-symptom-check");
    expect(blockedLauncher).toBeDisabled();
    expect(
      screen.getByTestId("quick-log-all-activities-symptom-check-plant-required"),
    ).toHaveTextContent("Select a plant to start a Symptom Check.");
    fireEvent.click(blockedLauncher);
    expect(screen.queryByTestId("quick-log-all-activities-form")).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
    missingPlant.unmount();

    mountSection({ plantId: PLANT });
    const allowedLauncher = screen.getByTestId("quick-log-all-activities-start-symptom-check");
    expect(allowedLauncher).toBeEnabled();
    fireEvent.click(allowedLauncher);
    expect(screen.getByTestId("quick-log-all-activities-form")).toHaveAttribute(
      "data-activity-id",
      "issue_observation",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shows a named-target verification block instead of a contradictory no-grow notice", async () => {
    mountSection({
      growId: null,
      tentId: null,
      plantId: null,
      externalPersistenceBlockReason: "Confirming this Quick Log target. Please wait.",
    });

    expect(screen.getByTestId("quick-log-all-activities-persistence-block")).toHaveTextContent(
      "Confirming this Quick Log target. Please wait.",
    );
    expect(screen.queryByTestId("quick-log-all-activities-no-grow")).not.toBeInTheDocument();

    selectActivity("note");
    const save = await screen.findByTestId("quick-log-all-activities-save");
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("keeps the no-grow notice for a genuinely unscoped activity editor", () => {
    mountSection({ growId: null, tentId: null, plantId: null });

    expect(screen.getByTestId("quick-log-all-activities-no-grow")).toHaveTextContent(
      "Select a grow to enable Quick Log actions.",
    );
    expect(
      screen.queryByTestId("quick-log-all-activities-persistence-block"),
    ).not.toBeInTheDocument();
  });

  it("uses the full visible symptom labels while preserving canonical test identities", () => {
    mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-yellowing")).toHaveTextContent(
      "Yellowing / discoloration",
    );
    expect(screen.getByTestId("quick-log-all-activities-symptom-tip_damage")).toHaveTextContent(
      "Burnt, crispy, or damaged tips",
    );
  });

  it("selects a requested supported activity, seeds its note, and never saves automatically", async () => {
    mountSection({
      requestedActivityId: "feeding",
      requestedNote: "Reviewed anonymous feeding note",
    });
    const form = await screen.findByTestId("quick-log-all-activities-form");
    expect(form).toHaveAttribute("data-activity-id", "feeding");
    expect(screen.getByTestId("quick-log-all-activities-note")).toHaveValue(
      "Reviewed anonymous feeding note",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reapplies a requested editor after its target resolves asynchronously", async () => {
    const view = mountSection({
      growId: null,
      tentId: null,
      plantId: null,
      requestedActivityId: "feeding",
      requestedNote: "Keep this note",
    });
    view.rerender(
      <QuickLogAllActivitiesSection
        growId={GROW}
        tentId={TENT}
        plantId={PLANT}
        plantStage="flower"
        requestedActivityId="feeding"
        requestedNote="Keep this note"
      />,
    );
    const form = await screen.findByTestId("quick-log-all-activities-form");
    expect(form).toHaveAttribute("data-activity-id", "feeding");
    expect(screen.getByTestId("quick-log-all-activities-note")).toHaveValue("Keep this note");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("keeps a stage-blocked requested Harvest out of the save form", async () => {
    mountSection({ requestedActivityId: "harvest", plantStage: "vegetative" });
    expect(
      await screen.findByTestId("quick-log-all-activities-requested-activity-blocked"),
    ).toHaveTextContent(/flower, flush, or harvest stages/i);
    expect(screen.queryByTestId("quick-log-all-activities-form")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("renders every supported activity from shared definitions after disclosure", () => {
    mountSection();
    revealAdditionalActivities();
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      expect(screen.getByTestId(`quick-log-all-activities-picker-${def.id}`)).toBeInTheDocument();
    }
  });

  it("renders Harvest as enabled for an eligible plant stage", () => {
    mountSection();
    revealAdditionalActivities();
    const btn = screen.getByTestId("quick-log-all-activities-picker-harvest");
    expect(btn).not.toBeDisabled();
    expect(
      screen.queryByTestId("quick-log-all-activities-picker-harvest-disabled-reason"),
    ).toBeNull();
  });
});

describe("QuickLogAllActivitiesSection — save routing", () => {
  it("notifies its caller exactly once after a confirmed Feeding save", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-feed" },
      error: null,
    });
    const onSaveSuccess = vi.fn();
    mountSection({
      requestedActivityId: "feeding",
      requestedNote: "light feeding",
      onSaveSuccess,
    });
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(onSaveSuccess).toHaveBeenCalledWith({
        activityId: "feeding",
        target: { growId: GROW, tentId: TENT, plantId: PLANT },
        growEventId: "e-feed",
      }),
    );
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
  });

  it("Note → quicklog_save_manual with p_action=note; dispatches + saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-note" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("note", "seedling perky");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_manual");
    expect(args.p_action).toBe("note");
    // Real deployed signature is target-scoped; the RPC derives grow/tent
    // server-side from the owned plant target (p_grow_id never existed).
    expect(args.p_target_type).toBe("plant");
    expect(args.p_target_id).toBe(PLANT);
    expect(args).not.toHaveProperty("p_grow_id");
    expect(args.p_note).toBe("seedling perky");
    await waitFor(() => expect(l.events.length).toBe(1));
    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    expect(items[0]).toHaveAttribute("data-saved-activity-id", "note");
    expect(items[0]).toHaveTextContent(/plant note/i);
    l.dispose();
  });

  it("Training → quicklog_save_event carries the chosen technique in p_details", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-train" },
      error: null,
    });
    mountSection();
    selectActivity("training");
    await screen.findByTestId("quick-log-all-activities-form");
    // The structured technique select is rendered from the detail-field spec.
    const technique = screen.getByTestId("quick-log-all-activities-detail-technique");
    fireEvent.change(technique, { target: { value: "topping" } });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "topped above 5th node" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("training");
    expect(args.p_details).toMatchObject({ technique: "topping" });
    // Never leak a reserved identity key through the detail seam.
    expect(args.p_details).not.toHaveProperty("user_id");
  });

  it("Defoliation → quicklog_save_event carries canonical intensity + canopy area + fixed technique", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-defol" },
      error: null,
    });
    mountSection();
    selectActivity("defoliation");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-intensity"), {
      target: { value: "medium" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-canopyArea"), {
      target: { value: "lower" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "cleared lower fan leaves" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("training"); // defoliation persists as training + subtype
    // Canonical contract: key `intensity` (light/medium/heavy) + explicit
    // technique=defoliation so the typed training adapter accepts the row.
    expect(args.p_details).toMatchObject({
      subtype: "defoliation",
      technique: "defoliation",
      intensity: "medium",
      canopyArea: "lower",
    });
  });

  it("Photo requires a real image: uploads to diary-photos and writes the diary row (no RPC)", async () => {
    mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    // No image chosen → Save disabled (a photo entry with no photo must never confirm).
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-subject"), {
      target: { value: "buds" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-caption"), {
      target: { value: "day 40 flower" },
    });
    const file = new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [file] },
    });
    expect(screen.getByTestId("quick-log-all-activities-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));
    // Uploaded to the private diary-photos bucket under the uploader's uid.
    expect(storageUploadMock).toHaveBeenCalledTimes(1);
    const [bucket, path] = storageUploadMock.mock.calls[0] as unknown as [string, string];
    expect(bucket).toBe("diary-photos");
    expect(path.startsWith("user-1/grow-1/")).toBe(true);
    // Diary row: photo_url COLUMN carries the bare storage path (the shape
    // Timeline signs); subject/caption ride details; identity keys win.
    const [table, row] = diaryInsertMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(table).toBe("diary_entries");
    expect(row.photo_url).toBe(path);
    expect(row.details).toMatchObject({
      event_type: "photo", // displayable type — badges as Photo, not Note
      subject: "buds",
      caption: "day 40 flower",
    });
    // The event-route RPC is never used for photo — it cannot render an image.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Photo upload failure surfaces the error and never writes a diary row", async () => {
    storageUploadMock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "bucket unavailable" },
    }));
    mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    const file = new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-all-activities-error")).toHaveTextContent(
        /photo upload failed/i,
      ),
    );
    expect(diaryInsertMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).toBeNull();
  });

  it("Photo insert response loss retains the upload and locks the photo save as uncertain", async () => {
    diaryInsertMock.mockImplementationOnce(async () => {
      throw new Error("network interrupted");
    });
    mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    const file = new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() =>
      expect(
        screen.getByTestId("quick-log-all-activities-photo-uncertain-recovery"),
      ).toHaveTextContent(/could not confirm the photo attachment/i),
    );
    // An insert may have committed before its response was lost. Never delete
    // the object until an exact owner-scoped reconciliation proves otherwise.
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).toBeNull();
  });

  it("keeps an ambiguous photo insert locked after legacy Quick Log closes and reopens", async () => {
    diaryInsertMock.mockImplementationOnce(async () => {
      throw new Error("network interrupted");
    });

    const firstOpen = mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a"], "plant-a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() =>
      expect(
        screen.getByTestId("quick-log-all-activities-photo-uncertain-recovery"),
      ).toHaveTextContent(/could not confirm the photo attachment/i),
    );

    // Closing the legacy Quick Log unmounts this presenter. Reopening the
    // same target must recover the exact retry fence rather than accepting a
    // blind duplicate photo insert.
    firstOpen.unmount();
    const reopenedSameTarget = mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a-retry"], "plant-a-retry.jpg", { type: "image/jpeg" })] },
    });
    expect(
      screen.getByTestId("quick-log-all-activities-photo-uncertain-recovery"),
    ).toHaveTextContent(/check timeline before adding another photo/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(diaryInsertMock).toHaveBeenCalledTimes(1);

    // A durable lock for plant A must not cross-contaminate plant B after the
    // same shell closes and reopens around a different valid target.
    reopenedSameTarget.unmount();
    mountSection({ plantId: OTHER_PLANT });
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-b"], "plant-b.jpg", { type: "image/jpeg" })] },
    });
    expect(
      screen.queryByTestId("quick-log-all-activities-photo-uncertain-recovery"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeEnabled();
  });

  it("re-enables the exact target only after a remount confirms its stored photo diary row", async () => {
    let capturedDiaryEntryId: string | null = null;
    diaryInsertMock.mockImplementationOnce(async (...args: unknown[]) => {
      capturedDiaryEntryId = (args[1] as { id?: string } | undefined)?.id ?? null;
      throw new Error("network interrupted");
    });
    // The first owner-scoped read cannot prove the response-loss outcome.
    diaryMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const firstOpen = mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a"], "plant-a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() =>
      expect(
        screen.getByTestId("quick-log-all-activities-photo-uncertain-recovery"),
      ).toBeInTheDocument(),
    );
    expect(capturedDiaryEntryId).toMatch(/^.+$/);

    firstOpen.unmount();
    // A later exact owner-scoped lookup proves that the original insert did
    // commit. Only that proof may clear the browser-session retry fence.
    diaryMaybeSingleMock.mockResolvedValueOnce({
      data: { id: capturedDiaryEntryId },
      error: null,
    });
    mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");

    await waitFor(() => expect(diarySelectMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(trackQuickLogSuccessMock).toHaveBeenCalledWith("photo", { reused: false }),
    );
    expect(trackQuickLogSuccessMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("quick-log-all-activities-photo-uncertain-recovery"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a-next"], "plant-a-next.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeEnabled();
  });

  it("keeps unresolved photo recovery bound to the captured plant after switching targets", async () => {
    let rejectInsert: ((reason?: unknown) => void) | null = null;
    diaryInsertMock.mockImplementationOnce(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectInsert = reject;
        }),
    );

    const view = mountSection();
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a"], "plant-a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));

    // The response for plant A is lost after the grower has already selected
    // plant B. The recovery fence must remain attached to A, not the current
    // presenter target.
    view.rerender(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId={GROW}
          tentId={TENT}
          plantId={OTHER_PLANT}
          plantStage="flower"
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByTestId("quick-log-all-activities-form")).toBeNull());
    await act(async () => {
      rejectInsert?.(new Error("network interrupted"));
    });
    await waitFor(() => expect(diarySelectMock).toHaveBeenCalledTimes(1));

    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-b"], "plant-b.jpg", { type: "image/jpeg" })] },
    });
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeEnabled();
    expect(
      screen.queryByTestId("quick-log-all-activities-photo-uncertain-recovery"),
    ).not.toBeInTheDocument();

    // Returning to A must keep the no-blind-retry fence and show its recovery
    // instruction again; B's usable editor must not clear A's uncertainty.
    view.rerender(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId={GROW}
          tentId={TENT}
          plantId={PLANT}
          plantStage="flower"
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByTestId("quick-log-all-activities-form")).toBeNull());
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["plant-a-again"], "plant-a-again.jpg", { type: "image/jpeg" })] },
    });
    expect(
      screen.getByTestId("quick-log-all-activities-photo-uncertain-recovery"),
    ).toHaveTextContent(/check timeline before adding another photo/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
  });

  it("Issue/Observation → quicklog_save_event carries observed sign + location (never a cause)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-obs" },
      error: null,
    });
    mountSection();
    selectActivity("issue_observation");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-observedSign"), {
      target: { value: "discoloration" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-observationLocation"), {
      target: { value: "lower_leaves" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "noticed this today" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("observation");
    expect(args.p_details).toMatchObject({
      subtype: "issue",
      observedSign: "discoloration",
      observationLocation: "lower_leaves",
    });
    expect(args.p_details).not.toHaveProperty("observation_stage");
  });

  it("keeps ordinary Issue/Observation available at tent scope without a selected plant", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-tent-observation" },
      error: null,
    });
    mountSection({ plantId: null });
    selectActivity("issue_observation");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-observedSign"), {
      target: { value: "spots" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Tent-level observation; no plant selected." },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_tent_id).toBe(TENT);
    expect(args.p_plant_id).toBeNull();
  });

  it("guided Symptom Check never writes on selection and requires confirmed stage", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: "e-symptom" }, error: null });
    mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-log-all-activities-symptom-stage")).toHaveValue("flower");
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();

    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-yellowing"));
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Lower leaves are pale; no cause assumed." },
    });
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-stage-confirmed"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("observation");
    expect(args.p_details).toMatchObject({
      subtype: "issue",
      event_type: "observation",
      observedSign: "discoloration",
      observation_stage: "flower",
    });
    expect(args.p_details).not.toHaveProperty("stage");
    expect(
      await screen.findByTestId("quick-log-all-activities-review-symptom-evidence"),
    ).toHaveAttribute("href", "/timeline?growId=grow-1#timeline-entry-e-symptom");
  });

  it("guided Symptom Check renders every canonical Quick Log stage option", () => {
    mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));

    const stageSelect = screen.getByTestId("quick-log-all-activities-symptom-stage");
    expect(
      within(stageSelect)
        .getAllByRole("option")
        .map((option) => ({
          label: option.textContent,
          value: (option as HTMLOptionElement).value,
        })),
    ).toEqual([
      { label: "Choose stage", value: "" },
      ...STAGES.map((stage) => ({ label: stage.label, value: stage.value })),
    ]);
  });

  it.each([
    ["flush", "flush"],
    ["cure", "drying"],
  ] as const)(
    "guided Symptom Check prefills %s and persists canonical %s evidence",
    async (plantStage, expectedStage) => {
      rpcMock.mockResolvedValueOnce({
        data: { ok: true, grow_event_id: `e-symptom-${expectedStage}` },
        error: null,
      });
      mountSection({ plantStage });
      fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));

      expect(screen.getByTestId("quick-log-all-activities-symptom-stage")).toHaveValue(
        expectedStage,
      );
      fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-spots"));
      fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
        target: { value: "Visible spots recorded without a diagnosis." },
      });
      fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-stage-confirmed"));
      fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

      await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
      expect(rpcMock.mock.calls[0][1].p_details).toMatchObject({
        observedSign: "spots",
        observation_stage: expectedStage,
      });
    },
  );

  it("guided Symptom Check fails closed when the plant stage is unknown", async () => {
    mountSection({ plantStage: "unknown" });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-spots"));
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Small spots on two leaves." },
    });
    expect(screen.getByTestId("quick-log-all-activities-symptom-stage")).toHaveValue("");
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("clears the no-symptoms box after a clean Symptom Check save before the next start", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-clean-check" },
      error: null,
    });
    mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-none-observed"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).toBeChecked();
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "Looked the plant over; nothing visible today." },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-stage-confirmed"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe("quicklog_save_event");
    expect(args.p_details).toMatchObject({
      subtype: "issue",
      event_type: "observation",
      observation_stage: "flower",
      symptom_check_result: "no_symptoms_observed",
    });
    expect(args.p_details).not.toHaveProperty("observedSign");

    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).not.toBeChecked();
  });

  it("clears the no-symptoms box after activity switch and after plant target switch", async () => {
    const view = mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-none-observed"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).toBeChecked();

    selectActivity("training");
    await screen.findByTestId("quick-log-all-activities-form");
    expect(screen.queryByTestId("quick-log-all-activities-symptom-none-observed")).toBeNull();

    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).not.toBeChecked();

    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-none-observed"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).toBeChecked();

    view.rerender(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId={GROW}
          tentId={TENT}
          plantId={OTHER_PLANT}
          plantStage="flower"
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByTestId("quick-log-all-activities-form")).toBeNull());

    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).not.toBeChecked();
  });

  it("clears the no-symptoms box when a requested activity is applied", async () => {
    const view = mountSection();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-start-symptom-check"));
    fireEvent.click(screen.getByTestId("quick-log-all-activities-symptom-none-observed"));
    expect(screen.getByTestId("quick-log-all-activities-symptom-none-observed")).toBeChecked();

    view.rerender(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId={GROW}
          tentId={TENT}
          plantId={PLANT}
          plantStage="flower"
          requestedActivityId="feeding"
        />
      </MemoryRouter>,
    );

    const form = await screen.findByTestId("quick-log-all-activities-form");
    expect(form).toHaveAttribute("data-activity-id", "feeding");
    expect(screen.queryByTestId("quick-log-all-activities-symptom-none-observed")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Environment check → canonical nested environment_check envelope (numbers) in p_details (celsius preference)", async () => {
    // Grower has explicitly set Celsius — the manual Temperature field labels
    // and validates as °C, and "24" is a plausible room temperature entered
    // (and stored) in that same unit. See the sibling Fahrenheit-preference
    // test below for the default-preference conversion path.
    saveTemperatureUnitPreference("celsius");
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-env" },
      error: null,
    });
    mountSection();
    selectActivity("environment_check");
    await screen.findByTestId("quick-log-all-activities-form");
    expect(screen.getByTestId("quick-log-all-activities-detail-temp_c")).toHaveAttribute(
      "placeholder",
      "e.g. 24",
    );
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-checkType"), {
      target: { value: "airflow" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-temp_c"), {
      target: { value: "24" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-humidity_pct"), {
      target: { value: "55" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "bumped the fan up a notch" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("environment");
    // Canonical envelope: nested, numeric, temp in CELSIUS under temp_c — the
    // shape Diary Calendar insights/timeline pickEnvelope() actually reads.
    expect(args.p_details).toMatchObject({
      checkType: "airflow",
      environment_check: { temp_c: 24, humidity_pct: 55 },
    });
  });

  it("Environment check manual Temperature pins Fahrenheit at entry (default/live preference) and converts to canonical °C on save", async () => {
    // No explicit preference saved — the app default is Fahrenheit. The
    // field must label/validate/placeholder in °F and convert the grower's
    // typed value back to canonical Celsius exactly once before persistence,
    // never store the raw Fahrenheit number under temp_c.
    clearTemperatureUnitPreference();
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-env-f" },
      error: null,
    });
    mountSection();
    selectActivity("environment_check");
    await screen.findByTestId("quick-log-all-activities-form");
    const tempInput = screen.getByTestId("quick-log-all-activities-detail-temp_c");
    expect(tempInput).toHaveAttribute("placeholder", "e.g. 75");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-checkType"), {
      target: { value: "airflow" },
    });
    fireEvent.change(tempInput, { target: { value: "75" } });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "bumped the fan up a notch" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    // 75°F → (75-32)*5/9 = 23.888..., rounded to 2 decimals.
    const stored = (args.p_details as { environment_check?: { temp_c?: number } }).environment_check
      ?.temp_c;
    expect(stored).toBeCloseTo(23.89, 2);
    expect(stored).not.toBe(75);
  });

  it("Environment check manual Temperature rejects an out-of-band Fahrenheit entry (140°F ceiling, not the celsius 60 ceiling)", async () => {
    clearTemperatureUnitPreference();
    mountSection();
    selectActivity("environment_check");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-temp_c"), {
      target: { value: "150" },
    });
    expect(screen.getByTestId("quick-log-all-activities-detail-temp_c-error")).toHaveTextContent(
      /between 14 and 140/,
    );
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Environment check BLOCKS the save on an impossible manual reading (inline error, no RPC)", async () => {
    mountSection();
    selectActivity("environment_check");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-detail-humidity_pct"), {
      target: { value: "999" },
    });
    // Inline per-field error + disabled Save: the grower corrects the entry;
    // it is never silently dropped behind a success receipt.
    expect(
      screen.getByTestId("quick-log-all-activities-detail-humidity_pct-error"),
    ).toHaveTextContent(/between 0 and 100/);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).toBeNull();
  });

  it("Training drops an unchosen (blank) technique — no technique key in p_details", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-train2" },
      error: null,
    });
    mountSection();
    await saveWithNote("training", "defoliated nothing, just LST by hand");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    // No technique chosen → sanitized out, not persisted as blank.
    if (args.p_details) expect(args.p_details).not.toHaveProperty("technique");
  });

  it("Watering emits the exact structured V2 intent after the parent-close seam, with no inline Save or RPC", () => {
    const order: string[] = [];
    const events: CustomEvent[] = [];
    const listener = (event: Event) => {
      order.push("dispatch");
      events.push(event as CustomEvent);
    };
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    mountSection({ onBeforeStructuredWaterOpen: () => order.push("close") });

    selectActivity("watering");

    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    expect(order).toEqual(["close", "dispatch"]);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ targetKey: "plant:plant-1", action: "water" });
    expect(screen.queryByTestId("quick-log-all-activities-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-all-activities-save")).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Watering fails closed for an external block, missing grow, or missing plant/tent target", () => {
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);

    const blocked = mountSection({ externalPersistenceBlockReason: "Target unavailable." });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      "Target unavailable.",
    );
    blocked.unmount();

    const noGrow = mountSection({ growId: null });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      /missing grow context/i,
    );
    noGrow.unmount();

    mountSection({ plantId: null, tentId: null });
    selectActivity("watering");
    expect(screen.getByTestId("quick-log-all-activities-structured-water-error")).toHaveTextContent(
      /choose a plant or tent/i,
    );

    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);
    expect(events).toHaveLength(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Feeding → quicklog_save_event event_type=feeding", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-f" },
      error: null,
    });
    mountSection();
    await saveWithNote("feeding", "1/2 dose base");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("feeding");
    expect(typeof args.p_idempotency_key).toBe("string");
    expect(args.p_idempotency_key.length).toBeGreaterThanOrEqual(8);
  });

  it("Training → quicklog_save_event event_type=training (no defoliation subtype)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-t" },
      error: null,
    });
    mountSection();
    await saveWithNote("training", "topped node 5");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    // The diary companion carries its type inside details (badge recovery);
    // no subtype/technique for plain training with nothing chosen.
    expect(args.p_details).toEqual({ event_type: "training" });
  });

  it("Defoliation → event_type=training + details.subtype=defoliation (fence)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-d" },
      error: null,
    });
    mountSection();
    await saveWithNote("defoliation", "removed 6 fan leaves");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("training");
    // subtype fence + fixed canonical technique + diary event_type stamp.
    expect(args.p_details).toEqual({
      subtype: "defoliation",
      technique: "defoliation",
      event_type: "training",
    });
  });

  it("Photo without an image cannot save at all (no RPC, no diary write)", async () => {
    mountSection();
    await saveWithoutNote("photo"); // click lands on a disabled Save
    expect(rpcMock).not.toHaveBeenCalled();
    expect(diaryInsertMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-all-activities-saved-item")).toBeNull();
  });

  it("Environment check → quicklog_save_event event_type=environment", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-env" },
      error: null,
    });
    mountSection();
    await saveWithNote("environment_check", "temp felt warm");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("environment");
  });

  it("Issue / observation → quicklog_save_event event_type=observation with issue subtype", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-obs" },
      error: null,
    });
    mountSection();
    await saveWithNote("issue_observation", "yellowing on fan leaf");
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("observation");
    expect(args.p_details).toEqual({ subtype: "issue", event_type: "observation" });
  });
});

describe("QuickLogAllActivitiesSection — Harvest v1b", () => {
  it("Harvest saves via quicklog_save_event event_type=harvest and appears in saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-h" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("harvest", "wet trim 210g");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("quicklog_save_event");
    expect(args.p_event_type).toBe("harvest");
    // Harvest must not be faked as observation or other type.
    expect(args.p_event_type).not.toBe("observation");
    await waitFor(() => expect(l.events.length).toBe(1));
    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    expect(items[0]).toHaveAttribute("data-saved-activity-id", "harvest");
    expect(items[0]).toHaveTextContent(/harvest/i);
    l.dispose();
  });

  it("failed Harvest RPC does not dispatch and shows no saved item", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const l = listenForEntryCreated();
    mountSection();
    await saveWithNote("harvest", "x");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(l.events.length).toBe(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    l.dispose();
  });

  it("unsaved Harvest draft does not appear in saved breakdown", () => {
    mountSection();
    selectActivity("harvest");
    // Cancel without saving.
    const cancel = screen.queryByTestId("quick-log-all-activities-cancel");
    if (cancel) fireEvent.click(cancel);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("no NON-harvest supported activity emits event_type='harvest'", async () => {
    for (const def of Object.values(QUICK_LOG_ACTIVITY_DEFINITIONS)) {
      if (!def.enabled) continue;
      if (def.saveRoute !== "event") continue;
      if (def.id === "harvest") continue;
      // Photo is diary-route only now (requires a real image, no RPC).
      if (def.id === "photo") continue;
      rpcMock.mockReset();
      rpcMock.mockResolvedValueOnce({
        data: { ok: true, grow_event_id: `id-${def.id}` },
        error: null,
      });
      const { unmount } = mountSection();
      await saveWithNote(def.id, "x");
      const [, args] = rpcMock.mock.calls[0];
      expect(args.p_event_type).not.toBe("harvest");
      unmount();
    }
  });
});

describe("QuickLogAllActivitiesSection — failure paths", () => {
  it("failed RPC does NOT dispatch, notify success, or show a saved item", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const l = listenForEntryCreated();
    const onSaveSuccess = vi.fn();
    mountSection({ onSaveSuccess });
    await saveWithNote("feeding", "x");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId("quick-log-all-activities-error");
    expect(l.events.length).toBe(0);
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    l.dispose();
  });

  it("unsaved draft selection never appears in saved breakdown", async () => {
    mountSection();
    selectActivity("training");
    await screen.findByTestId("quick-log-all-activities-form");
    // User cancels without saving.
    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Manual sensor snapshot is deferred to the existing card path (no RPC)", async () => {
    mountSection();
    selectActivity("manual_sensor_snapshot");
    await screen.findByTestId("quick-log-all-activities-manual-sensor-hint");
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLogAllActivitiesSection — safety copy", () => {
  it("does not use recommendation / diagnosis / healthy language in visible copy", () => {
    mountSection();
    const root = screen.getByTestId("quick-log-all-activities");
    const txt = root.textContent?.toLowerCase() ?? "";
    // Forbidden: recommendation/certainty phrasing.
    expect(txt).not.toMatch(/we recommend/);
    expect(txt).not.toMatch(/\bis safe to (feed|train|defoliate)/);
    expect(txt).not.toMatch(/ready to harvest/);
    expect(txt).not.toMatch(/plant is healthy/);
    expect(txt).not.toMatch(/guaranteed/);
  });
});

describe("QuickLogAllActivitiesSection — Harvest v1b.next hardening", () => {
  it("stale backend (invalid_event_type) shows backend-unavailable copy, no dispatch, no saved item, no Timeline write, no observation fallback", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_event_type" },
      error: null,
    });
    const l = listenForEntryCreated();
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-wet"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
      target: { value: "cola down" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    // Exactly one RPC — no observation-fallback second call.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_event_type).toBe("harvest");

    const err = await screen.findByTestId("quick-log-all-activities-error");
    expect(err.textContent?.toLowerCase()).toContain("not enabled on this backend yet");
    expect(l.events.length).toBe(0);
    expect(screen.queryByTestId("quick-log-all-activities-saved")).toBeNull();
    l.dispose();
  });

  it("saved breakdown shows concise harvest wet/dry/unit details after success", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-hd" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-wet"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-dry"), {
      target: { value: "32" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    const txt = items[0].textContent ?? "";
    expect(txt).toMatch(/harvest/i);
    expect(txt).toMatch(/wet\s*120\s*g/i);
    expect(txt).toMatch(/dry\s*32\s*g/i);
    expect(txt.toLowerCase()).not.toContain("yield");
  });

  it("saved breakdown hides missing dry/wet and stays plain Harvest with no weights", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-hd2" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-wet"), {
      target: { value: "50" },
    });
    // dry left empty
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    const txt = items[0].textContent ?? "";
    expect(txt).toMatch(/wet\s*50\s*g/i);
    expect(txt.toLowerCase()).not.toMatch(/\bdry\b/);
  });

  it("negative wet weight shows inline validation and blocks the save", async () => {
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-wet"), {
      target: { value: "-3" },
    });
    const err = await screen.findByTestId("quick-log-all-activities-harvest-wet-error");
    expect(err.textContent).toMatch(/cannot be negative/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("negative dry weight shows inline validation and blocks the save", async () => {
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-dry"), {
      target: { value: "-1.5" },
    });
    const err = await screen.findByTestId("quick-log-all-activities-harvest-dry-error");
    expect(err.textContent).toMatch(/cannot be negative/i);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("valid decimals save correctly and appear in saved breakdown", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "e-dec" },
      error: null,
    });
    mountSection();
    selectActivity("harvest");
    await screen.findByTestId("quick-log-all-activities-harvest-fields");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-wet"), {
      target: { value: "12.5" },
    });
    fireEvent.change(screen.getByTestId("quick-log-all-activities-harvest-dry"), {
      target: { value: "3.25" },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_details).toEqual({
      harvest: { wetWeight: "12.5", dryWeight: "3.25", weightUnit: "g" },
      event_type: "harvest",
    });
    const items = await screen.findAllByTestId("quick-log-all-activities-saved-item");
    expect(items[0].textContent).toMatch(/12\.5/);
    expect(items[0].textContent).toMatch(/3\.25/);
  });
});
