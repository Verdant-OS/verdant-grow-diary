/**
 * Action outcome capture tests.
 *
 * Pure-rules tests + static safety assertions on ActionDetail wiring.
 * No live DB. No automation. No device control. No alert mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ACTION_OUTCOME_EVENT_TYPE,
  ACTION_OUTCOME_KIND,
  OUTCOME_STATUSES,
  buildActionOutcomeDiaryDraft,
  outcomeMatchesAction,
  isValidOutcome,
  type OutcomeActionInput,
  type OutcomeGrowerInput,
  type OutcomeDraftResult,
} from "@/lib/actionOutcomeRules";
import { getEventType, EVENT_TYPES } from "@/lib/diary";

const ROOT = resolve(__dirname, "../..");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/actionOutcomeRules.ts"), "utf8");
const BADGES = readFileSync(resolve(ROOT, "src/components/DiaryEntryBadges.tsx"), "utf8");

function baseAction(overrides: Partial<OutcomeActionInput> = {}): OutcomeActionInput {
  return {
    id: "action-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: null,
    target_metric: "humidity_pct",
    suggested_change: "Review humidity control and increase airflow.",
    reason: "Humidity is high (78% > 65%) [alert:alert-99]",
    status: "completed",
    completed_at: "2026-05-26T10:00:00.000Z",
    ...overrides,
  };
}

function baseGrowerInput(overrides: Partial<OutcomeGrowerInput> = {}): OutcomeGrowerInput {
  return {
    outcome_status: "improved",
    note: null,
    ...overrides,
  };
}

const TEST_RECORDED_AT = "2026-05-26T14:00:00.000Z";
const TEST_OPTIONS = { recordedAt: TEST_RECORDED_AT };

// ---------------------------------------------------------------------------
// 1. Accepts all valid outcome statuses
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — accepts valid statuses", () => {
  for (const status of OUTCOME_STATUSES) {
    it(`accepts ${status}`, () => {
      const result = buildActionOutcomeDiaryDraft(
        baseAction(),
        { outcome_status: status },
        null,
        TEST_OPTIONS,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.draft.details.outcome_status).toBe(status);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Rejects invalid outcome status
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — rejects invalid", () => {
  it("rejects invalid outcome status", () => {
    const result = buildActionOutcomeDiaryDraft(baseAction(), { outcome_status: "magic" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe(
        "invalid_outcome_status",
      );
  });

  it("isValidOutcome rejects garbage", () => {
    expect(isValidOutcome("nope")).toBe(false);
    expect(isValidOutcome("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Rejects missing action id or grow id
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — rejects missing ids", () => {
  it("rejects missing action id", () => {
    const result = buildActionOutcomeDiaryDraft(baseAction({ id: null }), baseGrowerInput());
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe(
        "missing_action_id",
      );
  });

  it("rejects missing grow id", () => {
    const result = buildActionOutcomeDiaryDraft(baseAction({ grow_id: null }), baseGrowerInput());
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe("missing_grow_id");
  });

  it("rejects null action", () => {
    const result = buildActionOutcomeDiaryDraft(null, baseGrowerInput());
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe("missing_action");
  });
});

// ---------------------------------------------------------------------------
// 4. Rejects non-completed actions
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — rejects non-completed", () => {
  for (const status of ["pending", "approved", "rejected", "cancelled", "simulated"]) {
    it(`rejects ${status}`, () => {
      const result = buildActionOutcomeDiaryDraft(baseAction({ status }), baseGrowerInput());
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe(
          "action_not_completed",
        );
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Includes all required detail fields
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — draft includes all fields", () => {
  it("includes action_queue_id, source_alert_id, followup_entry_id, metric, suggested_change, reason, completed_at, outcome_status, outcome_kind, recorded_by", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      baseGrowerInput({ outcome_status: "worsened" }),
      { followup_entry_id: "entry-42" },
      { recordedAt: "2026-05-26T12:00:00.000Z" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.draft.details;
    expect(d.action_queue_id).toBe("action-1");
    expect(d.source_alert_id).toBe("alert-99");
    expect(d.followup_entry_id).toBe("entry-42");
    expect(d.metric).toBe("humidity_pct");
    expect(d.suggested_change).toBe("Review humidity control and increase airflow.");
    expect(d.reason).toContain("Humidity is high");
    expect(d.completed_at).toBe("2026-05-26T10:00:00.000Z");
    expect(d.outcome_status).toBe("worsened");
    expect(d.outcome_kind).toBe("24h_recheck");
    expect(d.recorded_by).toBe("grower");
    expect(d.recorded_at).toBe("2026-05-26T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// 5b. Deterministic recorded_at from injected timestamp
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — deterministic recorded_at", () => {
  it("uses the injected recordedAt timestamp exactly", () => {
    const ts = "2026-05-26T12:34:56.789Z";
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      baseGrowerInput(),
      { followup_entry_id: null },
      { recordedAt: ts },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.details.recorded_at).toBe(ts);
  });

  it("rejects null recordedAt with missing_recorded_at", () => {
    const result = buildActionOutcomeDiaryDraft(baseAction(), baseGrowerInput(), null, {
      recordedAt: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe(
        "missing_recorded_at",
      );
  });

  it("rejects omitted options with missing_recorded_at", () => {
    const result = buildActionOutcomeDiaryDraft(baseAction(), baseGrowerInput());
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect((result as Extract<OutcomeDraftResult, { ok: false }>).reason).toBe(
        "missing_recorded_at",
      );
  });
});

// ---------------------------------------------------------------------------
// 6. Uses grower note when provided
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — grower note", () => {
  it("uses grower note when provided", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      {
        outcome_status: "improved",
        note: "Looks much better today!",
      },
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.note).toBe("Looks much better today!");
  });
});

// ---------------------------------------------------------------------------
// 7. Uses conservative default note when grower note is empty
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — default notes", () => {
  it("improved default", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      {
        outcome_status: "improved",
        note: "",
      },
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.draft.note).toBe("Grower recorded this action as improved after follow-up.");
  });
  it("unchanged default", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      { outcome_status: "unchanged" },
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.draft.note).toBe("Grower recorded no clear change after follow-up.");
  });
  it("worsened default", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      { outcome_status: "worsened" },
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.draft.note).toBe("Grower recorded the condition as worsened after follow-up.");
  });
  it("more_data_needed default", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      {
        outcome_status: "more_data_needed",
      },
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.draft.note).toBe("Grower recorded that more data is needed after follow-up.");
  });
});

// ---------------------------------------------------------------------------
// 8. Never includes user_id
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — never includes user_id", () => {
  it("draft does not have user_id property", () => {
    const result = buildActionOutcomeDiaryDraft(
      baseAction(),
      baseGrowerInput(),
      null,
      TEST_OPTIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("user_id" in result.draft).toBe(false);
      expect("user_id" in result.draft.details).toBe(false);
    }
  });

  it("rules file never mentions user_id in an insert context", () => {
    expect(RULES).not.toMatch(/user_id\s*[=:]/);
  });
});

// ---------------------------------------------------------------------------
// 9. Never emits AI-inferred outcome language
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — no AI-inferred language", () => {
  it("default notes do not contain AI/inferred language", () => {
    for (const status of OUTCOME_STATUSES) {
      const result = buildActionOutcomeDiaryDraft(
        baseAction(),
        { outcome_status: status },
        null,
        TEST_OPTIONS,
      );
      if (result.ok) {
        expect(result.draft.note).not.toMatch(/AI|inferred|predicted|automated|algorithm/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Never emits device commands or control strings
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — no device/control strings", () => {
  it("rules file has no device-control or automation patterns outside safety comments", () => {
    // Strip comment lines to avoid false positives from safety documentation
    const codeOnly = RULES.split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    const forbidden = [
      /home.assistant/i,
      /mqtt/i,
      /webhook/i,
      /relay/i,
      /actuator/i,
      /service_role/i,
      /nutrient.*change/i,
    ];
    for (const re of forbidden) {
      expect(codeOnly).not.toMatch(re);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. action_outcome is registered in EVENT_TYPES as "Outcome"
// ---------------------------------------------------------------------------
describe("diary.ts — action_outcome registration", () => {
  it("EVENT_TYPES includes action_outcome with label Outcome", () => {
    const entry = EVENT_TYPES.find((e) => e.value === "action_outcome");
    expect(entry).toBeDefined();
    expect(entry!.label).toBe("Outcome");
  });
});

// ---------------------------------------------------------------------------
// 12. getEventType("action_outcome") returns Outcome, not Observation
// ---------------------------------------------------------------------------
describe("diary.ts — getEventType", () => {
  it("returns Outcome for action_outcome", () => {
    const result = getEventType("action_outcome");
    expect(result.label).toBe("Outcome");
    expect(result.label).not.toBe("Observation");
  });
});

// ---------------------------------------------------------------------------
// 13. DiaryEntryBadges includes action_outcome
// ---------------------------------------------------------------------------
describe("DiaryEntryBadges — action_outcome", () => {
  it("TAG_LABELS includes action_outcome", () => {
    expect(BADGES).toContain("action_outcome");
    expect(BADGES).toMatch(/action_outcome.*Outcome/s);
  });
  it("PRIMARY_TAGS includes action_outcome", () => {
    expect(BADGES).toMatch(/PRIMARY_TAGS[\s\S]*action_outcome/);
  });
});

// ---------------------------------------------------------------------------
// 14. ActionDetail shows "Record Outcome" only for completed actions
// ---------------------------------------------------------------------------
describe("ActionDetail — outcome section gating", () => {
  it("renders outcome section when status is completed", () => {
    expect(ACTION_DETAIL).toContain('row.status === "completed"');
    expect(ACTION_DETAIL).toContain("Record Outcome");
  });
});

// ---------------------------------------------------------------------------
// 15. ActionDetail does not show "Record Outcome" for non-completed statuses
// ---------------------------------------------------------------------------
describe("ActionDetail — does not show outcome for non-completed", () => {
  it("outcome section is gated behind completed status check", () => {
    // The outcome section is conditional on row.status === "completed"
    expect(ACTION_DETAIL).toMatch(/row\.status\s*===\s*["']completed["']/);
  });
});

// ---------------------------------------------------------------------------
// 16. ActionDetail checks for existing action_outcome before insert
// ---------------------------------------------------------------------------
describe("ActionDetail — idempotency check", () => {
  it("queries for existing outcome before allowing insert", () => {
    expect(ACTION_DETAIL).toContain(ACTION_OUTCOME_EVENT_TYPE);
    expect(ACTION_DETAIL).toContain("outcomeMatchesAction");
    expect(ACTION_DETAIL).toContain("existingOutcome");
  });

  it("recordOutcome contains a pre-insert contains() lookup before .insert()", () => {
    const outcomeBlock = ACTION_DETAIL.slice(
      ACTION_DETAIL.indexOf("async function recordOutcome"),
      ACTION_DETAIL.indexOf(
        "setOutcomeBusy(false);\n    setOutcomeDialogOpen(false);\n    setOutcomeStatus",
      ),
    );
    // The pre-insert idempotency check must use .contains() with the outcome fields
    expect(outcomeBlock).toMatch(/\.contains\(["']details["']/);
    // It must appear before the .insert() call
    const containsIdx = outcomeBlock.indexOf(".contains(");
    const insertIdx = outcomeBlock.indexOf(".insert(");
    expect(containsIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(containsIdx).toBeLessThan(insertIdx);
  });
});

// ---------------------------------------------------------------------------
// 17. ActionDetail insert payload does not include user_id
// ---------------------------------------------------------------------------
describe("ActionDetail — no user_id in insert", () => {
  it("does not include user_id in outcome insert payload", () => {
    // The recordOutcome function builds from the draft which never has user_id as a field
    const outcomeBlock = ACTION_DETAIL.slice(
      ACTION_DETAIL.indexOf("async function recordOutcome"),
      ACTION_DETAIL.indexOf("setOutcomeBusy(false);\n    setOutcomeDialogOpen(false);"),
    );
    // No user_id in the insert call itself
    expect(outcomeBlock).not.toMatch(/user_id\s*:/);
  });
});

// ---------------------------------------------------------------------------
// 18. Recording outcome does not mutate alerts
// ---------------------------------------------------------------------------
describe("ActionDetail — outcome does not mutate alerts", () => {
  it("outcome recording logic does not touch alerts table", () => {
    // The recordOutcome function only inserts into diary_entries
    const outcomeBlock = ACTION_DETAIL.slice(
      ACTION_DETAIL.indexOf("async function recordOutcome"),
      ACTION_DETAIL.indexOf("setOutcomeBusy(false);\n    setOutcomeDialogOpen(false);"),
    );
    expect(outcomeBlock).not.toMatch(/\.from\(["']alerts["']\).*update/);
  });
});

// ---------------------------------------------------------------------------
// 19. Recording outcome does not mutate action_queue status
// ---------------------------------------------------------------------------
describe("ActionDetail — outcome does not mutate action_queue", () => {
  it("outcome recording logic does not update action_queue", () => {
    const outcomeBlock = ACTION_DETAIL.slice(
      ACTION_DETAIL.indexOf("async function recordOutcome"),
      ACTION_DETAIL.indexOf("setOutcomeBusy(false);\n    setOutcomeDialogOpen(false);"),
    );
    expect(outcomeBlock).not.toMatch(/\.from\(["']action_queue["']\).*update/);
  });
});

// ---------------------------------------------------------------------------
// 20. Existing Action Completion → Follow-Up tests still pass (covered by run)
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — does not break followup rules", () => {
  it("follow-up imports are still present in ActionDetail", () => {
    expect(ACTION_DETAIL).toContain("buildActionFollowupDiaryDraft");
    expect(ACTION_DETAIL).toContain("followupMatchesAction");
  });
});

// ---------------------------------------------------------------------------
// 22. Static safety checks
// ---------------------------------------------------------------------------
describe("actionOutcomeRules — static safety", () => {
  it("no service_role in rules or ActionDetail", () => {
    expect(RULES).not.toContain("service_role");
    expect(ACTION_DETAIL).not.toContain("service_role");
  });
  it("no device-control calls in ActionDetail outcome section", () => {
    expect(ACTION_DETAIL).not.toMatch(/home.assistant/i);
    expect(ACTION_DETAIL).not.toMatch(/mqtt/i);
    expect(ACTION_DETAIL).not.toMatch(/webhook/i);
  });
});

// ---------------------------------------------------------------------------
// 23. UI files do not contain duplicated outcome status mapping tables
// ---------------------------------------------------------------------------
describe("ActionDetail — no duplicated outcome mapping tables in JSX", () => {
  it("outcome status labels live only in the helper, not duplicated in JSX", () => {
    // The default note mapping is only in actionOutcomeRules.ts
    const jsxMatches = ACTION_DETAIL.match(/Grower recorded this action as improved/g);
    expect(jsxMatches).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// outcomeMatchesAction helper
// ---------------------------------------------------------------------------
describe("outcomeMatchesAction", () => {
  it("matches correct row", () => {
    expect(
      outcomeMatchesAction(
        {
          details: {
            event_type: "action_outcome",
            action_queue_id: "a1",
            outcome_kind: "24h_recheck",
          },
        },
        "a1",
      ),
    ).toBe(true);
  });
  it("rejects mismatched action_queue_id", () => {
    expect(
      outcomeMatchesAction(
        {
          details: {
            event_type: "action_outcome",
            action_queue_id: "a2",
            outcome_kind: "24h_recheck",
          },
        },
        "a1",
      ),
    ).toBe(false);
  });
  it("rejects wrong event_type", () => {
    expect(
      outcomeMatchesAction(
        {
          details: {
            event_type: "action_followup",
            action_queue_id: "a1",
            outcome_kind: "24h_recheck",
          },
        },
        "a1",
      ),
    ).toBe(false);
  });
  it("rejects null row", () => {
    expect(outcomeMatchesAction(null, "a1")).toBe(false);
  });
});
