import { describe, expect, it } from "vitest";
import { PHASE_ONE_FIXTURES } from "./fixtures/ecowitt-real-ingest-phase1-fixtures";
import { handleEcoWittRealIngestHttpRequest } from "../../supabase/functions/_shared/ecowittRealIngestHttp.ts";

const EXPECTED_TOKEN = "test-bridge-token-only";
const REFERENCE_TIME = "2026-06-04T12:00:00.000Z";
const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

function findFixture(predicate: (fixture: any) => boolean): any {
  const fixture = PHASE_ONE_FIXTURES.find(predicate);
  if (!fixture) {
    throw new Error("Required EcoWitt Phase 1 fixture not found");
  }
  return fixture;
}

function getCandidate(fixture: any): unknown {
  return fixture.candidate ?? fixture.payload ?? fixture.input;
}

const validLiveCandidate = getCandidate(
  findFixture(
    (fixture) =>
      String(fixture.id ?? fixture.name ?? "").includes("valid") ||
      fixture.expected?.status === "accepted_candidate" ||
      fixture.expectedStatus === "accepted_candidate",
  ),
);

const rejectedCandidate = getCandidate(
  findFixture(
    (fixture) =>
      String(fixture.id ?? fixture.name ?? "").includes("manual") ||
      fixture.expected?.status === "rejected_candidate" ||
      fixture.expectedStatus === "rejected_candidate",
  ),
);

function requestFor(payload: unknown, init?: RequestInit): Request {
  return new Request("https://example.invalid/functions/v1/ecowitt-real-ingest", {
    method: "POST",
    headers: {
      authorization: `Bearer ${EXPECTED_TOKEN}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(payload),
    ...init,
  });
}

async function run(request: Request, expectedToken: string | null | undefined = EXPECTED_TOKEN) {
  const response = await handleEcoWittRealIngestHttpRequest({
    request,
    expectedToken,
    reference_time: REFERENCE_TIME,
    freshness_window_ms: FRESHNESS_WINDOW_MS,
  });

  const text = await response.text();
  const body = text.length > 0 ? JSON.parse(text) : null;
  return { response, body };
}

describe("EcoWitt real-ingest Edge HTTP wrapper", () => {
  it("responds to OPTIONS without invoking ingest behavior", async () => {
    const { response, body } = await run(
      new Request("https://example.invalid/functions/v1/ecowitt-real-ingest", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(body).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("rejects non-POST methods", async () => {
    const { response, body } = await run(
      new Request("https://example.invalid/functions/v1/ecowitt-real-ingest", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(405);
    expect(body.status).toBe("bad_request");
    expect(body.blocked_reasons).toContain("method_not_allowed");
    expect(body.accepted).toBe(false);
  });

  it("returns 401 when authorization is missing", async () => {
    const { response, body } = await run(
      requestFor(validLiveCandidate, {
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(401);
    expect(body.status).toBe("unauthorized");
    expect(body.accepted).toBe(false);
  });

  it("returns 403 when the bearer token is wrong", async () => {
    const { response, body } = await run(
      requestFor(validLiveCandidate, {
        headers: {
          authorization: "Bearer wrong-token",
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(body.status).toBe("forbidden");
    expect(JSON.stringify(body)).not.toContain("wrong-token");
  });

  it("fails closed when the expected token is not configured", async () => {
    const { response, body } = await run(requestFor(validLiveCandidate), null);

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_configured");
    expect(body.accepted).toBe(false);
  });

  it("returns 400 for malformed JSON", async () => {
    const { response, body } = await run(
      new Request("https://example.invalid/functions/v1/ecowitt-real-ingest", {
        method: "POST",
        headers: {
          authorization: `Bearer ${EXPECTED_TOKEN}`,
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(body.status).toBe("bad_request");
    expect(body.blocked_reasons).toContain("malformed_json");
  });

  it("returns 400 for a missing request body", async () => {
    const { response, body } = await run(
      new Request("https://example.invalid/functions/v1/ecowitt-real-ingest", {
        method: "POST",
        headers: {
          authorization: `Bearer ${EXPECTED_TOKEN}`,
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(body.status).toBe("bad_request");
    expect(body.blocked_reasons).toContain("missing_body");
  });

  it("returns 422 for a rejected candidate and does not claim persistence", async () => {
    const { response, body } = await run(requestFor(rejectedCandidate));

    expect(response.status).toBe(422);
    expect(body.status).toBe("rejected_candidate");
    expect(body.accepted).toBe(false);
    expect(body.can_persist_later).toBe(false);
    expect(JSON.stringify(body).toLowerCase()).not.toContain("persisted");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("stored");
  });

  it("returns 202 for a valid candidate but still states validation-only behavior", async () => {
    const { response, body } = await run(requestFor(validLiveCandidate));

    expect(response.status).toBe(202);
    expect(body.status).toBe("accepted_candidate");
    expect(body.accepted).toBe(true);
    expect(body.can_persist_later).toBe(true);
    expect(body.dedupe_key).toMatch(/^ecowitt:v1:/);
    expect(body.note).toContain("validates candidates only");
    expect(body.note).toContain("does not store sensor readings");
  });

  it("redacts sensitive payload preview fields", async () => {
    const payload = {
      ...(validLiveCandidate as Record<string, unknown>),
      raw_payload: {
        passkey: "fake-passkey",
        token: "fake-token",
        mac: "00:11:22:33:44:55",
        ip: "192.0.2.10",
        station: "fake-station",
        safe_value: "visible",
      },
    };

    const { body } = await run(requestFor(payload));
    const serialized = JSON.stringify(body);

    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("visible");
    expect(serialized).not.toContain("fake-passkey");
    expect(serialized).not.toContain("00:11:22:33:44:55");
    expect(serialized).not.toContain("192.0.2.10");
  });

  it("is deterministic with fixed reference_time and fixed token", async () => {
    const first = await run(requestFor(validLiveCandidate));
    const second = await run(requestFor(validLiveCandidate));

    expect(first.response.status).toBe(second.response.status);
    expect(first.body).toEqual(second.body);
  });
});

