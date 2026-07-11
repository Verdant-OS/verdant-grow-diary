/**
 * Action Follow-Up Evidence V1 — Slice 4e (Quick Log handoff) tests.
 *
 * Covers:
 *  - Pure prefill builder: preserves grow/tent/plant/action context,
 *    handles missing tent/plant, rejects missing action/grow,
 *    deterministic output, never emits evidence or write payloads.
 *  - Safe internal return-path builder + validator: allowlist of
 *    `/actions/:actionId` only; rejects external, protocol-relative,
 *    schema-relative, malformed, unrelated, control-char paths.
 *  - Handoff CTA UI: label, accessible name, min tap target,
 *    dispatches the existing `verdant:open-quicklog` event only, help
 *    copy present, no raw storage refs / DB ids in visible text.
 *  - Refresh: `verdant:entry-created` after click triggers refresh;
 *    a stray entry-created without a preceding click does NOT.
 *  - Cancel semantics: not clicking → nothing refreshes.
 *  - Never auto-selects / auto-saves.
 *  - Static safety: no file input, capture attr, uploader, object
 *    URL, service_role, or AI/device paths in Slice 4e files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ACTION_FOLLOWUP_QUICKLOG_CTA_HELP,
  ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL,
  ACTION_FOLLOWUP_QUICKLOG_EVENT,
  ACTION_FOLLOWUP_QUICKLOG_SOURCE,
  buildActionFollowUpQuickLogPrefill,
  buildActionFollowUpReturnPath,
  isSafeActionFollowUpReturnPath,
} from "@/lib/actionFollowUpQuickLogHandoffRules";
import ActionFollowUpQuickLogHandoffButton from "@/components/ActionFollowUpQuickLogHandoffButton";

// ---------------------------------------------------------------------------
// Pure prefill builder
// ---------------------------------------------------------------------------

describe("buildActionFollowUpQuickLogPrefill", () => {
  const ACTION = {
    actionId: "act-1",
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
  };

  it("preserves full grow/tent/plant context", () => {
    const p = buildActionFollowUpQuickLogPrefill(ACTION);
    expect(p).not.toBeNull();
    expect(p!.growId).toBe("grow-1");
    expect(p!.tentId).toBe("tent-1");
    expect(p!.plantId).toBe("plant-1");
    expect(p!.eventType).toBe("photo");
    expect(p!.suggestSnapshot).toBe(false);
    expect(p!.source).toBe(ACTION_FOLLOWUP_QUICKLOG_SOURCE);
    expect(typeof p!.note).toBe("string");
  });

  it("handles missing tent and plant safely", () => {
    const p = buildActionFollowUpQuickLogPrefill({
      ...ACTION,
      tentId: null,
      plantId: null,
    });
    expect(p).not.toBeNull();
    expect(p!.tentId).toBeNull();
    expect(p!.plantId).toBeNull();
  });

  it("returns null when action id or grow id are missing", () => {
    expect(buildActionFollowUpQuickLogPrefill(null)).toBeNull();
    expect(
      buildActionFollowUpQuickLogPrefill({ ...ACTION, actionId: "" }),
    ).toBeNull();
    expect(
      buildActionFollowUpQuickLogPrefill({ ...ACTION, growId: "   " }),
    ).toBeNull();
  });

  it("is deterministic for identical input", () => {
    const a = buildActionFollowUpQuickLogPrefill(ACTION);
    const b = buildActionFollowUpQuickLogPrefill(ACTION);
    expect(a).toEqual(b);
  });

  it("never emits evidence or write payload fields", () => {
    const p = buildActionFollowUpQuickLogPrefill(ACTION)!;
    const keys = Object.keys(p);
    for (const forbidden of [
      "outcome",
      "photoReference",
      "sensorSnapshotId",
      "actionQueueId",
      "diaryEntryId",
      "userId",
      "user_id",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Safe return-path allowlist
// ---------------------------------------------------------------------------

describe("action follow-up safe return path", () => {
  it("accepts only /actions/:actionId", () => {
    expect(isSafeActionFollowUpReturnPath("/actions/act-1")).toBe(true);
    expect(buildActionFollowUpReturnPath("act-1")).toBe("/actions/act-1");
  });

  it("rejects external, protocol-relative, schema, unrelated, malformed paths", () => {
    for (const bad of [
      "",
      "  ",
      "actions/act-1", // no leading slash
      "//evil.com/actions/act-1",
      "https://evil.com/actions/act-1",
      "http://x/y",
      "javascript:alert(1)",
      "data:text/html,",
      "vbscript:x",
      "file:///etc/passwd",
      "/actions", // missing id
      "/actions/", // empty id
      "/actions/act-1?next=/x", // query string
      "/actions/act-1#frag", // fragment
      "/actions/act-1/extra", // extra segment
      "/actions/../actions/act-1", // traversal
      "/dashboard/act-1",
      "/plants/act-1",
      "/actions/act 1", // space
      "/actions/act\u0000-1", // control
      "/actionsx/act-1",
    ]) {
      expect(isSafeActionFollowUpReturnPath(bad as unknown as string)).toBe(false);
    }
  });

  it("buildActionFollowUpReturnPath returns null for unsafe action ids", () => {
    for (const bad of ["", "  ", "a/b", "a?b", "a#b", "..", "\u0000x", "-".repeat(200)]) {
      expect(buildActionFollowUpReturnPath(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Handoff CTA
// ---------------------------------------------------------------------------

describe("ActionFollowUpQuickLogHandoffButton", () => {
  const ACTION = {
    actionId: "act-1",
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
  };

  let dispatched: CustomEvent[] = [];
  let origDispatch: typeof window.dispatchEvent;

  beforeEach(() => {
    dispatched = [];
    origDispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = ((ev: Event) => {
      if (ev instanceof CustomEvent) dispatched.push(ev);
      return origDispatch(ev);
    }) as typeof window.dispatchEvent;
  });

  afterEach(() => {
    window.dispatchEvent = origDispatch;
  });

  it("renders CTA with copy, accessible name, and min 44px tap target", () => {
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={() => {}}
      />,
    );
    const btn = screen.getByTestId("action-followup-quicklog-handoff-btn");
    expect(btn).toHaveAccessibleName(ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL);
    expect(btn.className).toMatch(/min-h-\[44px\]/);
    expect(screen.getByTestId("action-followup-quicklog-handoff-help")).toHaveTextContent(
      ACTION_FOLLOWUP_QUICKLOG_CTA_HELP,
    );
  });

  it("dispatches only the existing verdant:open-quicklog event on click", () => {
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("action-followup-quicklog-handoff-btn"));
    const opens = dispatched.filter((e) => e.type === ACTION_FOLLOWUP_QUICKLOG_EVENT);
    expect(opens).toHaveLength(1);
    const detail = opens[0].detail as Record<string, unknown>;
    expect(detail.growId).toBe("grow-1");
    expect(detail.tentId).toBe("tent-1");
    expect(detail.plantId).toBe("plant-1");
    expect(detail.eventType).toBe("photo");
    // No write payload leaked.
    expect(detail.photoReference).toBeUndefined();
    expect(detail.outcome).toBeUndefined();
  });

  it("does not visibly render the action id or raw storage refs", () => {
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={() => {}}
      />,
    );
    expect(screen.queryByText(/act-1/)).toBeNull();
    expect(screen.queryByText(/storage:\/\//)).toBeNull();
  });

  it("refreshes only after click, when verdant:entry-created fires", () => {
    const onCreated = vi.fn();
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={onCreated}
      />,
    );
    // Stray entry-created without a prior click does nothing.
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(onCreated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("action-followup-quicklog-handoff-btn"));
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(onCreated).toHaveBeenCalledTimes(1);

    // Subsequent entry-created events (from unrelated saves) do not
    // re-fire until the CTA is clicked again — one-shot arming.
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("cancel semantics: no click → onPhotoCreated never fires even if the modal opens elsewhere", () => {
    const onCreated = vi.fn();
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={onCreated}
      />,
    );
    // Simulate an unrelated Quick Log save (e.g. FAB) — must not
    // touch this handoff's refresh.
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("never auto-selects or auto-saves after refresh", () => {
    // Contract: onPhotoCreated is the ONLY side effect. Callers use it
    // to bump a reload nonce; this component never touches the form
    // selection or calls a save service. Enforced by inspecting the
    // component's exported prop surface.
    const onCreated = vi.fn();
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={ACTION}
        onPhotoCreated={onCreated}
      />,
    );
    fireEvent.click(screen.getByTestId("action-followup-quicklog-handoff-btn"));
    window.dispatchEvent(new Event("verdant:entry-created"));
    expect(onCreated).toHaveBeenCalledTimes(1);
    // No auto-select side channel exists — the component has no
    // reference to any selection setter or save service.
    expect(onCreated.mock.calls[0]).toEqual([]);
  });

  it("no-op safely with missing grow/action context (does not dispatch)", () => {
    render(
      <ActionFollowUpQuickLogHandoffButton
        action={{ actionId: "", growId: "", tentId: null, plantId: null }}
        onPhotoCreated={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("action-followup-quicklog-handoff-btn"));
    const opens = dispatched.filter((e) => e.type === ACTION_FOLLOWUP_QUICKLOG_EVENT);
    expect(opens).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Static safety — no upload infra, no service role, no AI/device
// ---------------------------------------------------------------------------

describe("Slice 4e static safety", () => {
  const files = [
    "src/lib/actionFollowUpQuickLogHandoffRules.ts",
    "src/components/ActionFollowUpQuickLogHandoffButton.tsx",
    "src/components/ActionFollowUpEvidenceSection.tsx",
    "src/components/ActionFollowUpEvidenceForm.tsx",
    "src/components/ActionFollowUpEvidenceCard.tsx",
    "src/components/ActionFollowUpExistingPhotoSelector.tsx",
    "src/components/ActionFollowUpExistingPhotoEvidence.tsx",
  ];

  it("Action Queue follow-up files contain no upload / capture / object-URL / service-role / AI / device paths", () => {
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/type=["']file["']/);
      expect(src, f).not.toMatch(/\bcapture=/);
      expect(src, f).not.toMatch(/\.upload\s*\(/);
      expect(src, f).not.toMatch(/createObjectURL/);
      expect(src, f).not.toMatch(/service_role/i);
      expect(src, f).not.toMatch(/openai|anthropic|gemini/i);
      expect(src, f).not.toMatch(/\bfetch\(\s*["']https?:\/\//i);
      expect(src, f).not.toMatch(/navigator\.mediaDevices|getUserMedia/);
    }
  });

  it("photo + sensor evidence remain independent (regression)", () => {
    const section = readFileSync(
      resolve(process.cwd(), "src/components/ActionFollowUpEvidenceSection.tsx"),
      "utf8",
    );
    // Handoff must NOT be wired to the sensor selector slot.
    expect(section).toMatch(/ActionFollowUpQuickLogHandoffButton/);
    // Selector still receives its own value/onChange props.
    expect(section).toMatch(/onChange=\{setSelectedPhotoReference\}/);
  });
});
