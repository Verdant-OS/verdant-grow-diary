import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSensorsPageSessionController } from "@/hooks/useSensorsPageSession";
import {
  STANDARD_MANUAL_CORRECTION_IDENTITY,
  createSensorsPageSession,
  createManualDraftValues,
  editManualDraftValues,
  reexpressManualDraftTemperature,
  reconcileSensorsSelection,
  type ManualDraftValues,
  type ManualSnapshotPayloads,
  type SensorsManualDraft,
  type SensorsSaveClaimResult,
} from "@/lib/sensorsPageSessionRules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const tents = [{ id: A }, { id: B }];
const clients: QueryClient[] = [];
function client() {
  const qc = new QueryClient();
  clients.push(qc);
  return qc;
}
afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  vi.useRealTimers();
});

function values(humidity = "57"): ManualDraftValues {
  return {
    form: { airTemp: "24", airTempUnit: "C", humidityPct: humidity },
    tempUnitOverride: "C",
    devicePreset: "custom",
    deviceCustom: "grower meter",
    hasEditedReading: true,
    revision: 1,
    pendingStandardSnapshot: null,
    saveUnconfirmed: false,
    lastSaved: null,
  };
}
function payloads(tentId = B): ManualSnapshotPayloads {
  return [
    {
      tent_id: tentId,
      metric: "humidity_pct",
      value: 57,
      source: "manual",
      ts: "2026-09-16T12:00:00.123Z",
      captured_at: "2026-09-16T12:00:00.123Z",
      quality: "ok",
    },
  ];
}
function controller(qc = client(), owner = "owner-a") {
  const result = createSensorsPageSessionController(qc, owner);
  expect(result).not.toBeNull();
  return result!;
}
function setup(qc = client()) {
  const session = controller(qc);
  session.reconcileSelection({
    intent: { tentId: A, requireExactMatch: true },
    intentKey: "required-a",
    tents,
    tentsLoaded: true,
  });
  return session;
}
function draft(
  session: ReturnType<typeof controller>,
  tentId = B,
  correctionIdentity = STANDARD_MANUAL_CORRECTION_IDENTITY,
): SensorsManualDraft {
  const result = session.getOrInitializeDraft({
    epoch: session.getSnapshot()!.selection.draftEpoch,
    correctionIdentity,
    defaultTentId: tentId,
    ownedTentIds: [A, B],
    initial: values(),
  });
  expect(result).not.toBeNull();
  return result!;
}
function claimed(result: SensorsSaveClaimResult) {
  expect(result.status).toBe("claimed");
  if (result.status !== "claimed") throw new Error("expected save claim");
  return result.claim;
}

describe("Sensors selection continuity", () => {
  it("does not consume required intent before a successful owned-tent read", () => {
    const initial = createSensorsPageSession(7);
    const input = {
      intent: { tentId: A, requireExactMatch: true },
      intentKey: "a",
      tents,
      tentsLoaded: false,
    };
    expect(reconcileSensorsSelection(initial, input)).toBe(initial);
    expect(
      reconcileSensorsSelection(initial, { ...input, tentsLoaded: true }).selection.tentId,
    ).toBe(A);
  });

  it("retains explicit B and all B draft fields through an ordinary-route remount", () => {
    const qc = client();
    const original = setup(qc);
    original.selectTent(B, "required-a", tents);
    const entered = draft(original);
    const remounted = controller(qc);
    remounted.reconcileSelection({
      intent: { tentId: null },
      intentKey: "ordinary",
      tents,
      tentsLoaded: true,
    });
    expect(remounted.getSnapshot()!.selection.tentId).toBe(B);
    expect(remounted.getSnapshot()!.draft).toEqual(entered);
    expect(remounted.getSnapshot()!.draft!.values.form).toEqual({
      airTemp: "24",
      airTempUnit: "C",
      humidityPct: "57",
    });
    expect(remounted.getSnapshot()!.draft!.values.deviceCustom).toBe("grower meter");
  });

  it("returning to required A discards B measurements and starts a new draft epoch", () => {
    const session = setup();
    session.selectTent(B, "required-a", tents);
    const before = draft(session);
    session.reconcileSelection({
      intent: { tentId: null },
      intentKey: "ordinary",
      tents,
      tentsLoaded: true,
    });
    session.reconcileSelection({
      intent: { tentId: A, requireExactMatch: true },
      intentKey: "required-a",
      tents,
      tentsLoaded: true,
    });
    expect(session.getSnapshot()!.selection.tentId).toBe(A);
    expect(session.getSnapshot()!.selection.draftEpoch).toBeGreaterThan(before.identity.epoch);
    expect(session.getSnapshot()!.draft).toBeNull();
  });

  it("reopening an explicit route preserves the same actual manual destination and pending identity", () => {
    const session = setup();
    const entered = draft(session, A);
    const first = claimed(session.claimSave(entered.identity, payloads(A)));
    session.settleSave(first, { status: "unconfirmed" });
    const before = session.getSnapshot()!.selection.draftEpoch;
    session.reconcileSelection({
      intent: { tentId: A, requireExactMatch: true },
      intentKey: "new-explicit-a",
      tents,
      tentsLoaded: true,
    });
    expect(session.getSnapshot()!.draft?.identity).toEqual(entered.identity);
    expect(
      session.getSnapshot()!.draft?.values.pendingStandardSnapshot?.payloads[0].captured_at,
    ).toBe("2026-09-16T12:00:00.123Z");
    expect(session.getSnapshot()!.selection.draftEpoch).toBe(before);
  });

  it("page A plus manual dropdown B can select page B without discarding B readings", () => {
    const session = setup();
    const manualB = draft(session, B);
    session.selectTent(B, "required-a", tents);
    expect(session.getSnapshot()!.selection.tentId).toBe(B);
    expect(session.getSnapshot()!.draft).toBe(manualB);
    expect(session.getSnapshot()!.selection.draftEpoch).toBe(manualB.identity.epoch);
  });

  it("same-navigation revalidation preserves the explicit replacement and draft", () => {
    const session = setup();
    session.selectTent(B, "required-a", tents);
    const before = draft(session);
    session.reconcileSelection({
      intent: { tentId: A, requireExactMatch: true },
      intentKey: "required-a",
      tents,
      tentsLoaded: true,
    });
    expect(session.getSnapshot()!.selection.tentId).toBe(B);
    expect(session.getSnapshot()!.draft).toBe(before);
  });

  it("a removed required replacement fails closed instead of retargeting its draft", () => {
    const session = setup();
    session.selectTent(B, "required-a", tents);
    draft(session);
    session.reconcileSelection({
      intent: { tentId: A, requireExactMatch: true },
      intentKey: "required-a",
      tents: [{ id: A }],
      tentsLoaded: true,
    });
    expect(session.getSnapshot()!.selection.tentId).toBeNull();
    expect(session.getSnapshot()!.draft).toBeNull();
  });

  it("rejects an unowned chip selection without replacing a valid draft", () => {
    const session = setup();
    const before = draft(session, A);
    session.selectTent(C, "required-a", tents);
    expect(session.getSnapshot()!.selection.tentId).toBe(A);
    expect(session.getSnapshot()!.draft).toBe(before);
  });

  it("handles missing tent lists without throwing or claiming a usable destination", () => {
    const result = reconcileSensorsSelection(createSensorsPageSession(1), {
      intent: null,
      intentKey: "ordinary",
      tents: null,
      tentsLoaded: true,
    });
    expect(result.selection.tentId).toBeNull();
    expect(result.selection.appliedIntentKey).toBe("ordinary");
  });

  it("moves an ordinary page fallback to surviving manual B without discarding B's draft", () => {
    const session = controller();
    session.reconcileSelection({ intent: null, intentKey: "ordinary", tents, tentsLoaded: true });
    const manualB = draft(session, B);
    session.reconcileSelection({
      intent: null,
      intentKey: "ordinary",
      tents: [{ id: B }],
      tentsLoaded: true,
    });
    expect(session.getSnapshot()!.selection.tentId).toBe(B);
    expect(session.getSnapshot()!.draft).toBe(manualB);
  });

  it("the same source state and intent give identical results without mutation", () => {
    const initial = createSensorsPageSession(4);
    const input = { intent: { tentId: B }, intentKey: "b", tents, tentsLoaded: true };
    expect(reconcileSensorsSelection(initial, input)).toEqual(
      reconcileSensorsSelection(initial, input),
    );
    expect(initial.selection.tentId).toBeNull();
    expect(initial.selection.draftEpoch).toBe(0);
  });
});

describe("manual draft target ownership", () => {
  it("clicking the active temperature unit leaves the unresolved snapshot unchanged", () => {
    const unchanged = {
      ...values(),
      pendingStandardSnapshot: { revision: 1, payloads: payloads() },
      saveUnconfirmed: true,
    };
    expect(reexpressManualDraftTemperature(unchanged, "C", "F")).toBe(unchanged);
    expect(unchanged.pendingStandardSnapshot.payloads[0].captured_at).toBe(
      "2026-09-16T12:00:00.123Z",
    );
  });

  it("temperature display conversion preserves frozen retry identity, revision and confirmation", () => {
    const original = {
      ...values(),
      pendingStandardSnapshot: { revision: 1, payloads: payloads() },
      saveUnconfirmed: true,
      lastSaved: { line: "Saved", tentId: B, capturedAt: "2026-09-16T12:00:00.123Z" },
    };
    const converted = reexpressManualDraftTemperature(original, "F", "C");
    expect(converted.form.airTemp).toBe("75.2");
    expect(converted.form.airTempUnit).toBe("F");
    expect(converted.tempUnitOverride).toBe("F");
    expect(converted.revision).toBe(1);
    expect(converted.pendingStandardSnapshot).toBe(original.pendingStandardSnapshot);
    expect(converted.saveUnconfirmed).toBe(true);
    expect(converted.lastSaved).toBe(original.lastSaved);
    expect(converted.deviceCustom).toBe("grower meter");
    expect(converted.hasEditedReading).toBe(true);
    expect(original.form.airTemp).toBe("24");
  });

  it("uses the explicit fallback unit only when the draft has no stored unit", () => {
    const original = createManualDraftValues({ airTemp: "77", humidityPct: "57" });
    const converted = reexpressManualDraftTemperature(original, "C", "F");
    expect(converted.form.airTemp).toBe("25");
    expect(converted.form.humidityPct).toBe("57");
    expect(converted.revision).toBe(0);
    expect(converted.hasEditedReading).toBe(false);
  });

  it.each(["", "bad"])("unit reexpression keeps blank or invalid entered text %s intact", (raw) => {
    const converted = reexpressManualDraftTemperature(
      createManualDraftValues({ airTemp: raw, airTempUnit: "F" }),
      "C",
      "F",
    );
    expect(converted.form.airTemp).toBe(raw);
    expect(converted.form.airTempUnit).toBe("C");
    expect(converted.revision).toBe(0);
  });

  it("restores manual dropdown B under unchanged page A, never A-labelling B's values", () => {
    const session = setup();
    const a = draft(session, A);
    const b = session.changeDraftTarget(a.identity, {
      tentId: B,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      ownedTentIds: [A, B],
      values: values("61"),
    });
    expect(b?.tentId).toBe(B);
    const restored = session.getOrInitializeDraft({
      epoch: session.getSnapshot()!.selection.draftEpoch,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      defaultTentId: A,
      ownedTentIds: [A, B],
      initial: values(""),
    });
    expect(restored?.tentId).toBe(B);
    expect(restored?.values.form.humidityPct).toBe("61");
  });

  it("an unavailable manual target cannot transplant its readings into the page target", () => {
    const session = setup();
    const b = draft(session);
    const restored = session.getOrInitializeDraft({
      epoch: b.identity.epoch,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      defaultTentId: A,
      ownedTentIds: [A],
      initial: values(""),
    });
    expect(restored?.tentId).toBe(A);
    expect(restored?.values.form.humidityPct).toBe("");
    expect(restored?.identity.id).not.toBe(b.identity.id);
  });

  it("correction and standard contexts never reuse each other's fields", () => {
    const session = setup();
    const standard = draft(session);
    const correction = session.getOrInitializeDraft({
      epoch: standard.identity.epoch,
      correctionIdentity: "correction-a-reading-id",
      defaultTentId: A,
      ownedTentIds: [A, B],
      initial: values("20"),
    });
    expect(correction?.tentId).toBe(A);
    expect(correction?.values.form.humidityPct).toBe("20");
    expect(session.updateDraft(standard.identity, () => values("99"))).toBeNull();
    expect(session.getSnapshot()!.draft?.values.form.humidityPct).toBe("20");
  });

  it("does not share mutable nested draft state with caller-owned objects", () => {
    const session = setup();
    const initial = values();
    const created = session.getOrInitializeDraft({
      epoch: session.getSnapshot()!.selection.draftEpoch,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      defaultTentId: A,
      ownedTentIds: [A],
      initial,
    });
    expect(created).not.toBeNull();
    initial.form.humidityPct = "99";
    expect(created!.values.form.humidityPct).toBe("57");
    expect(Object.isFrozen(created!.values.form)).toBe(true);
  });

  it("keeps edited cached fields immutable when React Query stores a second revision", () => {
    const session = setup();
    const entered = draft(session);
    const edited = session.updateDraft(entered.identity, (current) =>
      editManualDraftValues(current, { form: { ...current.form, humidityPct: "59" } }),
    );
    expect(edited?.values.form.humidityPct).toBe("59");
    expect(Object.isFrozen(edited!.values.form)).toBe(true);
  });

  it("editing the device hint invalidates pending identity and stale confirmation", () => {
    const old = {
      ...values(),
      pendingStandardSnapshot: { revision: 1, payloads: payloads() },
      saveUnconfirmed: true,
      lastSaved: { line: "Saved", tentId: B, capturedAt: "2026-09-16T12:00:00Z" },
    };
    const edited = editManualDraftValues(old, {
      deviceCustom: "second meter",
    });
    expect(edited.revision).toBe(2);
    expect(edited.pendingStandardSnapshot).toBeNull();
    expect(edited.saveUnconfirmed).toBe(false);
    expect(edited.lastSaved).toBeNull();
    expect(edited.deviceCustom).toBe("second meter");
    expect(old.pendingStandardSnapshot.payloads[0].captured_at).toBe("2026-09-16T12:00:00.123Z");
    expect(createManualDraftValues({ humidityPct: "" }).hasEditedReading).toBe(false);
  });

  it("returning from draft A to B to A rejects callbacks for the original A identity", () => {
    const session = setup();
    const originalA = draft(session, A);
    const b = session.changeDraftTarget(originalA.identity, {
      tentId: B,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      ownedTentIds: [A, B],
      values: values("60"),
    })!;
    const secondA = session.changeDraftTarget(b.identity, {
      tentId: A,
      correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
      ownedTentIds: [A, B],
      values: values("40"),
    })!;
    expect(session.updateDraft(originalA.identity, () => values("99"))).toBeNull();
    expect(secondA.values.form.humidityPct).toBe("40");
    expect(session.getSnapshot()!.draft).toBe(secondA);
  });
});

describe("session-wide pending save identity", () => {
  it("a remount retains the exact retry scope, metric and observation time after an unconfirmed response", () => {
    const qc = client();
    const session = setup(qc);
    const entered = draft(session);
    const first = claimed(session.claimSave(entered.identity, payloads()));
    expect(session.settleSave(first, { status: "unconfirmed" })).toBe(true);
    const remounted = controller(qc);
    const restored = remounted.getSnapshot()!.draft!;
    expect(restored.values.saveUnconfirmed).toBe(true);
    const replacement = payloads();
    replacement[0].ts = "2026-09-16T14:00:00Z";
    replacement[0].captured_at = "2026-09-16T14:00:00Z";
    replacement[0].value = 61;
    const retry = claimed(remounted.claimSave(restored.identity, replacement));
    expect(retry.payloads).toEqual([
      {
        tent_id: B,
        metric: "humidity_pct",
        value: 57,
        source: "manual",
        ts: "2026-09-16T12:00:00.123Z",
        captured_at: "2026-09-16T12:00:00.123Z",
        quality: "ok",
      },
    ]);
  });

  it("holds one in-flight claim across remount and page-target changes", () => {
    const qc = client();
    const session = setup(qc);
    const first = claimed(session.claimSave(draft(session).identity, payloads()));
    session.selectTent(B, "required-a", tents);
    session.selectTent(A, "required-a", tents);
    const next = draft(session, A);
    const remounted = controller(qc);
    expect(remounted.claimSave(next.identity, payloads(A)).status).toBe("busy");
    session.settleSave(first, { status: "success", update: () => values("") });
    expect(session.getSnapshot()!.draft!.values.form.humidityPct).toBe("57");
    expect(remounted.claimSave(next.identity, payloads(A)).status).toBe("claimed");
  });

  it("an earlier revision cannot clear later edits or apply its error to them", () => {
    const session = setup();
    const entered = draft(session);
    const save = claimed(session.claimSave(entered.identity, payloads()));
    session.updateDraft(entered.identity, (current) => ({
      ...current,
      revision: 2,
      form: { ...current.form, humidityPct: "62" },
    }));
    session.settleSave(save, { status: "unconfirmed" });
    expect(session.getSnapshot()!.draft!.values.form.humidityPct).toBe("62");
    expect(session.getSnapshot()!.draft!.values.saveUnconfirmed).toBe(false);
    expect(session.getSnapshot()!.inFlight).toBeNull();
  });

  it("a wrong-tent payload never acquires a save claim", () => {
    const session = setup();
    const entered = draft(session);
    expect(session.claimSave(entered.identity, payloads(A)).status).toBe("stale");
    expect(session.getSnapshot()!.inFlight).toBeNull();
  });

  it("correction save uncertainty never creates a standard snapshot retry record", () => {
    const session = setup();
    const correction = draft(session, B, "correction-reading-b");
    const save = claimed(session.claimSave(correction.identity, payloads()));
    session.settleSave(save, { status: "unconfirmed" });
    expect(session.getSnapshot()!.draft!.values.pendingStandardSnapshot).toBeNull();
    expect(session.getSnapshot()!.draft!.values.saveUnconfirmed).toBe(false);
  });

  it("a completion replay cannot release another save's in-flight claim", () => {
    const session = setup();
    const entered = draft(session);
    const first = claimed(session.claimSave(entered.identity, payloads()));
    session.settleSave(first, { status: "unconfirmed" });
    const second = claimed(session.claimSave(entered.identity, payloads()));
    expect(session.settleSave(first, { status: "success" })).toBe(false);
    expect(session.getSnapshot()!.inFlight).toBe(second);
  });

  it("successful matching completion clears pending identity and applies its confirmation", () => {
    const session = setup();
    const entered = draft(session);
    const save = claimed(session.claimSave(entered.identity, payloads()));
    session.settleSave(save, {
      status: "success",
      update: (current) => ({
        ...current,
        form: {},
        lastSaved: {
          line: "Saved manual humidity",
          capturedAt: "2026-09-16T12:00:00.123Z",
          tentId: B,
        },
      }),
    });
    expect(session.getSnapshot()!.draft!.values.pendingStandardSnapshot).toBeNull();
    expect(session.getSnapshot()!.draft!.values.lastSaved?.tentId).toBe(B);
    expect(session.getSnapshot()!.inFlight).toBeNull();
  });
});

describe("owner and runtime boundaries", () => {
  it("does not expose owner A draft to B on the same QueryClient", () => {
    const qc = client();
    const a = setup(qc);
    draft(a);
    const b = controller(qc, "owner-b");
    expect(b.getSnapshot()!.draft).toBeNull();
    expect(b.getSnapshot()!.selection.tentId).toBeNull();
  });

  it("auth clear detaches old controllers and late callbacks cannot recreate owner state", () => {
    const qc = client();
    const old = setup(qc);
    const entered = draft(old);
    const save = claimed(old.claimSave(entered.identity, payloads()));
    qc.clear();
    expect(old.getSnapshot()).toBeNull();
    expect(old.settleSave(save, { status: "success", update: () => values("") })).toBe(false);
    expect(
      old.getOrInitializeDraft({
        epoch: entered.identity.epoch,
        correctionIdentity: STANDARD_MANUAL_CORRECTION_IDENTITY,
        defaultTentId: B,
        ownedTentIds: [B],
        initial: values(),
      }),
    ).toBeNull();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    const fresh = setup(qc);
    expect(fresh.getSnapshot()!.generation).not.toBe(save.generation);
    old.selectTent(B, "required-a", tents);
    expect(fresh.getSnapshot()!.selection.tentId).toBe(A);
    expect(fresh.getSnapshot()!.draft).toBeNull();
  });

  it("notifies mounted consumers on clear without allowing their old updates to repopulate it", () => {
    const qc = client();
    const session = setup(qc);
    const observations: Array<boolean> = [];
    const stop = session.subscribe(() => observations.push(session.getSnapshot() === null));
    qc.clear();
    stop();
    expect(observations).toContain(true);
  });

  it("a synchronous owner clear during a draft updater cannot resurrect the old entry", () => {
    const qc = client();
    const session = setup(qc);
    const entered = draft(session);
    const result = session.updateDraft(entered.identity, (current) => {
      qc.clear();
      return editManualDraftValues(current, { form: { humidityPct: "99" } });
    });
    expect(result).toBeNull();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("a synchronous replacement generation cannot be overwritten by the old updater", () => {
    const qc = client();
    const old = setup(qc);
    const entered = draft(old);
    const result = old.updateDraft(entered.identity, (current) => {
      qc.clear();
      setup(qc);
      return editManualDraftValues(current, { form: { humidityPct: "99" } });
    });
    expect(result).toBeNull();
    const fresh = controller(qc);
    expect(fresh.getSnapshot()!.draft).toBeNull();
    expect(fresh.getSnapshot()!.generation).not.toBe(old.getSnapshot()?.generation);
  });

  it("an updater returning its old values after auth clear cannot return a detached private draft", () => {
    const qc = client();
    const session = setup(qc);
    const entered = draft(session);
    const result = session.updateDraft(entered.identity, (current) => {
      qc.clear();
      return current;
    });
    expect(result).toBeNull();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("an updater returning old values after same-owner reinitialization cannot return the former draft", () => {
    const qc = client();
    const old = setup(qc);
    const entered = draft(old);
    const result = old.updateDraft(entered.identity, (current) => {
      qc.clear();
      setup(qc);
      return current;
    });
    expect(result).toBeNull();
    expect(controller(qc).getSnapshot()!.draft).toBeNull();
  });

  it("a nested newer draft edit cannot be hidden by an outer unchanged update", () => {
    const session = setup();
    const entered = draft(session);
    const result = session.updateDraft(entered.identity, (current) => {
      session.updateDraft(entered.identity, (latest) =>
        editManualDraftValues(latest, { form: { humidityPct: "63" } }),
      );
      return current;
    });
    expect(result).toBeNull();
    expect(session.getSnapshot()!.draft!.values.form.humidityPct).toBe("63");
  });

  it("does not silently expire an unresolved snapshot after normal query garbage-collection time", () => {
    vi.useFakeTimers();
    const session = setup();
    const entered = draft(session);
    claimed(session.claimSave(entered.identity, payloads()));
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(session.getSnapshot()!.inFlight).not.toBeNull();
  });

  it.each([null, undefined, "", "   "])("does not allocate an anonymous draft for %s", (owner) => {
    const qc = client();
    expect(createSensorsPageSessionController(qc, owner)).toBeNull();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});
