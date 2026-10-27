import { BrowserClient, defaultStackParser } from "@sentry/browser";
import { describe, expect, it } from "vitest";
import { REDACTED, scrubEvent } from "@/lib/errorReportingRules";

// Regression: blanket message redaction currently makes null-read and other
// TypeErrors indistinguishable when a boundary receives no stack. Categories
// must be computed before redaction, and never contain the matched text.
function boundaryEvent(value: unknown, stacktrace?: unknown) {
  return {
    tags: { source: "react_error_boundary", route: "/welcome", handled: "false" },
    exception: {
      values: [{ type: "TypeError", value, ...(stacktrace !== undefined ? { stacktrace } : {}) }],
    },
  };
}

describe("privacy-safe boundary diagnostics", () => {
  it.each([
    ["Cannot read properties of null (reading 'private@example.com')", "nullish_read"],
    ["Cannot read properties of undefined (reading 'secret diary note')", "nullish_read"],
    ["private@example.com is not a function", "not_callable"],
    ["secret diary note", "other"],
    [REDACTED, "redacted"],
    [undefined, "missing"],
    [null, "missing"],
    [{ note: "private@example.com" }, "missing"],
  ])("classifies %j without retaining its content", (message, kind) => {
    const event = boundaryEvent(message);
    const result = scrubEvent(event);
    expect(result.tags).toMatchObject({ error_message_kind: kind, stack_state: "missing" });
    expect(result.exception.values[0]?.value).toBe(REDACTED);
    const wire = JSON.stringify(result);
    expect(wire).not.toContain("private@example.com");
    expect(wire).not.toContain("secret diary note");
    // Never mutate the event before other SDK consumers have seen it.
    expect(event.exception.values[0]?.value).toBe(message);
  });

  it.each([
    [{ frames: [] }, "empty"],
    [{ frames: [{}] }, "no_location"],
    [
      { frames: [{ filename: "https://verdantgrowdiary.com/assets/app.js", lineno: 1, colno: 9 }] },
      "location",
    ],
    [{ frames: [{ filename: "javascript:private@example.com", lineno: 1 }] }, "no_location"],
    [{ frames: [{ filename: "/assets/app.js", lineno: NaN }] }, "no_location"],
    [{ frames: "private@example.com" }, "missing"],
  ])("reports actual stack availability for %j", (stack, state) => {
    expect(scrubEvent(boundaryEvent("message", stack)).tags).toMatchObject({ stack_state: state });
  });

  it("classifies the outer exception rather than an earlier cause", () => {
    const event = boundaryEvent("private function is not a function");
    event.exception.values.unshift({ type: "Error", value: "secret cause" });
    expect(scrubEvent(event).tags).toMatchObject({ error_message_kind: "not_callable" });
    expect(JSON.stringify(scrubEvent(event))).not.toContain("secret cause");
  });

  it("bounds message classification and does not mistake a redacted long asset path for no stack", () => {
    const event = boundaryEvent("Cannot read properties of null (reading '" + "x".repeat(1000));
    expect(scrubEvent(event).tags).toMatchObject({ error_message_kind: "other" });
    const withStack = boundaryEvent("message", {
      frames: [
        {
          filename: "https://verdantgrowdiary.com/assets/OnboardingChecklistCard-AbCd1234.js",
          lineno: 1,
        },
      ],
    });
    expect(scrubEvent(withStack).tags).toMatchObject({ stack_state: "location" });
  });

  it("does not classify another exception type using TypeError message rules", () => {
    const event = boundaryEvent("Cannot read properties of null (reading 'length')");
    event.exception.values[0]!.type = "Error";
    expect(scrubEvent(event).tags).toMatchObject({ error_message_kind: "other" });
  });

  it("discards caller-supplied diagnostic tags and ignores non-boundary events", () => {
    expect(
      scrubEvent({
        tags: { source: "other", stack_state: "location", error_message_kind: "nullish_read" },
      }).tags,
    ).toEqual({ source: "other" });
    expect(
      scrubEvent({ tags: { source: "route_error_component", stack_state: "location" } }).tags,
    ).toMatchObject({ stack_state: "missing", error_message_kind: "missing" });
  });

  it("preserves real SDK stack coordinates through the production scrubber", async () => {
    // No SDK init, network transport, global handlers, session or production event.
    const client = new BrowserClient({
      dsn: "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1",
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
      integrations: [],
      stackParser: defaultStackParser,
    });
    const error = new TypeError("Cannot read properties of null (reading 'private@example.com')");
    error.stack =
      "TypeError: private@example.com\n    at render (https://verdantgrowdiary.com/assets/app.js?token=secret:12:34)";
    const event = await client.eventFromException(error);
    event.tags = { source: "react_error_boundary", route: "/onboarding" };
    const result = scrubEvent(event);
    expect(result.tags).toMatchObject({
      error_message_kind: "nullish_read",
      stack_state: "location",
    });
    expect(result.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      {
        filename: "https://verdantgrowdiary.com/assets/app.js",
        lineno: 12,
        colno: 34,
        in_app: true,
      },
    ]);
    const wire = JSON.stringify(result);
    expect(wire).not.toContain("private@example.com");
    expect(wire).not.toContain("token=secret");
    expect(result.exception?.values?.[0]?.value).toBe(REDACTED);
  });
});
