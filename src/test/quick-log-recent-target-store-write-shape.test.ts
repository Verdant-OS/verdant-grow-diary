/**
 * The remembered-target writer may put EXACTLY four fields on the device.
 *
 * `quicklog-sensor-strip-split-guardrail` already pins this, by matching the
 * projection's source text inside `JSON.stringify({...})`. That is the shape
 * `AGENTS.md` singles out as insufficient, and the gap is not hypothetical —
 * measured on this base:
 *
 *   comment the projection out, restore `JSON.stringify(target)`
 *     source-regex fence  -> 6/6 PASS   (blind to it)
 *     this suite          -> FAILS      (catches it)
 *
 * A one-line comment-out is the most common way anyone disables a setting,
 * and it leaves the regex matching the commented text. The same blindness
 * applies to the threat the projection actually defends against: a widened
 * runtime object. TypeScript's excess-property check only catches an object
 * LITERAL at the call site, so a spread database row or an `as` cast reaches
 * the writer untyped, and no amount of source matching can see a field that
 * exists only at runtime.
 *
 * So the two fences cover different halves and neither replaces the other:
 * the scan keeps forbidden payload CLASSES out of the source, and this keeps
 * unknown FIELDS out of the stored value.
 *
 * Asserted against the resolved storage value, never against source text.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { rememberRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore";
import { RECENT_TARGET_STORAGE_KEY_PREFIX } from "@/lib/quickLogRecentTargetSuggestion";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const USER = "u1";
const KEY = `${RECENT_TARGET_STORAGE_KEY_PREFIX}${USER}`;
const CANONICAL_FIELDS = ["plantId", "growId", "tentId", "savedAt"];

const VALID = {
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  savedAt: "2026-08-19T12:00:00.000Z",
};

function storedRecord(): Record<string, unknown> | null {
  const raw = getLocalStorageItemForTest(KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

describe("rememberRecentQuickLogTarget — the stored shape is closed", () => {
  beforeEach(() => clearLocalStorageForTest());
  afterEach(() => clearLocalStorageForTest());

  it("writes exactly the four canonical fields", () => {
    rememberRecentQuickLogTarget(VALID, USER);
    expect(Object.keys(storedRecord() ?? {}).sort()).toEqual([...CANONICAL_FIELDS].sort());
  });

  it("drops every field a widened caller adds", () => {
    // The shapes that actually reach a writer like this in practice: a spread
    // plant row, an attached sensor payload, a note the grower typed, and an
    // auth artifact. None of them may survive to the device.
    const widened = {
      ...VALID,
      raw_payload: { temperatureC: 24.4 },
      sensor_readings: [{ id: "r1" }],
      note: "grower's private note",
      access_token: "should-never-be-here",
      service_role: "should-never-be-here",
      user_id: "u1",
      email: "grower@example.com",
    } as Parameters<typeof rememberRecentQuickLogTarget>[0];

    rememberRecentQuickLogTarget(widened, USER);

    const record = storedRecord();
    expect(Object.keys(record ?? {}).sort()).toEqual([...CANONICAL_FIELDS].sort());
    // Assert on the serialized bytes too: a nested value could otherwise hide
    // inside a field whose NAME is canonical.
    const raw = getLocalStorageItemForTest(KEY) ?? "";
    for (const forbidden of [
      "raw_payload",
      "sensor_readings",
      "private note",
      "should-never-be-here",
      "grower@example.com",
      "temperatureC",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("normalizes absent scope to null rather than dropping the field", () => {
    // The reader distinguishes "no grow recorded" from "field missing"; keeping
    // the key present with a null value is what makes those the same thing.
    rememberRecentQuickLogTarget(
      { plantId: "p1", growId: null, tentId: null, savedAt: VALID.savedAt },
      USER,
    );
    const record = storedRecord();
    expect(Object.keys(record ?? {}).sort()).toEqual([...CANONICAL_FIELDS].sort());
    expect(record?.growId).toBeNull();
    expect(record?.tentId).toBeNull();
  });

  it("writes nothing at all without a signed-in account", () => {
    rememberRecentQuickLogTarget(VALID, null);
    rememberRecentQuickLogTarget(VALID, undefined);
    rememberRecentQuickLogTarget(VALID, "   ");
    // Positive control: the same payload DOES write under a real account, so
    // "nothing stored" here cannot be an artifact of the helper.
    expect(getLocalStorageItemForTest(KEY)).toBeNull();
    rememberRecentQuickLogTarget(VALID, USER);
    expect(getLocalStorageItemForTest(KEY)).not.toBeNull();
  });

  it("scopes the write to the account that made it", () => {
    rememberRecentQuickLogTarget(VALID, "someone-else");
    expect(getLocalStorageItemForTest(KEY)).toBeNull();
    expect(
      getLocalStorageItemForTest(`${RECENT_TARGET_STORAGE_KEY_PREFIX}someone-else`),
    ).not.toBeNull();
  });
});
