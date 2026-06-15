# Runbook: AI Doctor Action Queue Suggestion Preview — Manual QA

**Audience:** Verdant operators, on-call, support, and release sign-off reviewers verifying the AI Doctor Action Queue suggestion preview in a real browser session.

**Scope:** This runbook validates the read-only preview surface only. It does not validate Action Queue creation, device control, automation, or AI model behavior.

---

## What the preview is

The AI Doctor Action Queue suggestion preview is a **read-only eligibility/status card** embedded inside the AI Doctor context/readiness panel. It tells the grower whether the current context (plant, tent, stage, sensor snapshot) is sufficient to later support a safe, approval-required Action Queue suggestion.

- It **shows status**, not actions.
- It **does not create** Action Queue rows.
- It **does not run** equipment commands.
- It **does not invoke** Supabase writes, Edge Functions, model calls, or alert creation.

---

## Manual QA scenarios

Run these scenarios in a staging or local preview build against real UI. Do not use mock-only environments for the final sign-off pass.

### Scenario 1: Imported CSV-only history

**Setup:**
- Grow with at least one tent and plant.
- Only imported CSV sensor history present (no current live/manual snapshot).

**Steps:**
1. Navigate to the plant’s AI Doctor panel.
2. Observe the preview card inside the readiness panel.

**Expected:**
- Status chip reads `needs_current_reading` or equivalent.
- Copy explains that imported history is background-only and a current reading is required.
- No Action Queue row is created.

### Scenario 2: Missing plant / tent / stage

**Setup:**
- Grow with a plant that lacks stage, or a tent with no plant selected.

**Steps:**
1. Open the AI Doctor readiness panel.
2. Review the preview card.

**Expected:**
- Status chip reads `missing_context`.
- Missing-context chips explicitly list what is absent (e.g., stage, tent, sensor snapshot).

### Scenario 3: Invalid / unknown telemetry

**Setup:**
- Plant with a sensor snapshot containing at least one flagged-invalid reading (e.g., pH `14.0`, humidity `0%`, soil moisture `100%` with invalid flag).

**Steps:**
1. Open the AI Doctor readiness panel.

**Expected:**
- Status chip reads `blocked_invalid_data` or equivalent.
- Invalid / "Needs review" chips render next to the offending fields.
- Invalid telemetry is **not** shown as healthy.

### Scenario 4: Device-command-shaped language risk

**Setup:**
- Any context where the preview path might accidentally receive text containing equipment-control language.

**Steps:**
1. Inspect the preview card text in the DOM.
2. Search the page for strings: `turn on`, `turn off`, `pump`, `dose`, `setpoint`, `mqtt publish`, `set temp`, `set humidity`.

**Expected:**
- No such strings appear in the preview card.
- If any reach the helper layer, `isUnsafePreviewText` blocks them and the status falls back to `blocked_device_command_risk`.

### Scenario 5: Current manual / live readings + full plant context

**Setup:**
- Plant with stage, tent, grow defined.
- At least one current `live` or `manual` sensor snapshot within the last 24 hours.
- No invalid readings flagged.

**Steps:**
1. Open the AI Doctor readiness panel.

**Expected:**
- Status chip reads `eligible` or equivalent.
- Safety notes visible: `Approval required`, `No device control`, `Preview only`.
- No executable buttons.
- No approved/queued/executed wording.

### Scenario 6: Missing / invalid chips render correctly

**Setup:**
- Combine scenarios 2 and 3: missing stage + invalid pH.

**Steps:**
1. Open the AI Doctor readiness panel.

**Expected:**
- Both `missing_context` and `blocked_invalid_data` chips appear.
- Chips are readable, do not overlap, and use distinct visual treatment.

### Scenario 7: Screen-reader / status text is present

**Setup:**
- Any scenario above.

**Steps:**
1. Inspect the preview card in browser dev tools.
2. Look for `role="status"` on the summary element.
3. Run a screen reader (VoiceOver, NVDA, or ChromeVox) and navigate to the preview card.

**Expected:**
- Screen reader announces the status summary first (e.g., "Action Queue suggestion preview: needs current reading").
- No focusable elements inside the preview card.

### Scenario 8: No approved / queued / executed wording

**Setup:**
- Any scenario above.

**Steps:**
1. Read every visible string inside the preview card.
2. Search the DOM for `approved`, `queued`, `executed`.

**Expected:**
- None of these words appear.
- All language remains suggestive/eligibility-oriented.

### Scenario 9: No executable buttons

**Setup:**
- Any scenario above.

**Steps:**
1. Inspect the preview card for `<button>` elements.
2. Try keyboard tabbing through the card.

**Expected:**
- Zero `<button>` tags inside the preview card.
- No interactive elements that could be mistaken for "Create Action" or "Execute".

### Scenario 10: No Action Queue row appears after page interaction

**Setup:**
- Eligible scenario (scenario 5).

**Steps:**
1. Open the browser’s Network tab and filter by `action_queue` or Supabase REST requests.
2. Interact with the preview card (hover, click around it, resize window).
3. Check the Action Queue table directly in the database or via the app’s Action Queue view.

**Expected:**
- No `INSERT` into `action_queue`.
- No `functions.invoke` calls.
- No alert creation network traffic attributable to the preview path.

---

## Operator evidence template

For each scenario, record:

| Field | Value |
|-------|-------|
| **Route / page** | e.g., `/grow/:id/plant/:id/ai-doctor` |
| **Grow / tent / plant** | Names or IDs used |
| **Input context** | What sensor data, history, and plant fields were present |
| **Expected status** | e.g., `eligible`, `needs_current_reading` |
| **Actual status** | What the UI showed |
| **Screenshots** | Attach or link |
| **Console / network notes** | Any errors, unexpected requests, warnings |
| **Supabase write check result** | `No writes observed` or note any unexpected INSERT/UPDATE |
| **Pass / fail** | `PASS` / `FAIL` |
| **Follow-up defect link** | Linear/GitHub issue if filed |

---

## Safety checklist

Before signing off, confirm all of the following:

- [ ] No `action_queue` rows were created during QA session.
- [ ] No Supabase write path (`insert`, `update`, `delete`, `upsert`) was invoked by the preview path.
- [ ] No `supabase.functions.invoke` call was triggered by the preview path.
- [ ] No device-control language (`turn on`, `turn off`, `pump`, `dose`, `setpoint`, `mqtt publish`) appeared in preview copy.
- [ ] No raw payload, private field, vendor secret, or internal ID rendered in UI.
- [ ] Imported CSV history remained labeled as non-live (source = `csv`, not promoted to `live`).
- [ ] Current live/manual readings were required for `eligible` status.
- [ ] Invalid/unknown telemetry was blocked and flagged, never treated as healthy.
- [ ] Screen-reader summary (`role="status"`) was present and accurate.
- [ ] No `<button>` elements existed inside the preview card.
- [ ] Static safety scanner (`bun run ai-doctor:preview-safety`) passed.

---

## Related docs

- **Scanner docs:** [`docs/testing/ai-doctor-preview-safety-scanner.md`](../testing/ai-doctor-preview-safety-scanner.md)
- **Output contract:** [`docs/ai-doctor-output-contract.md`](../ai-doctor-output-contract.md)
- **Imported history QA checklist:** [`docs/qa/ai-doctor-imported-history-safety-checklist.md`](../qa/ai-doctor-imported-history-safety-checklist.md)
- **Imported history runbook:** [`docs/runbooks/ai-doctor-imported-history.md`](./ai-doctor-imported-history.md)

---

## Validation commands

```bash
# Static safety scanner
bun run ai-doctor:preview-safety

# Release docs safety
bun run docs:release-safety
```

Known good results:

| Check | Expected |
|-------|----------|
| `bun run ai-doctor:preview-safety` | OK |
| `bun run docs:release-safety` | OK |
