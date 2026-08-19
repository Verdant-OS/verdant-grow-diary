import { describe, expect, it } from "vitest";

import {
  buildActionQueueTransitionDiagnostic,
  deriveActionQueueTransitionBlockerReason,
  isActionQueueTransitionResponse,
  renderActionQueueTransitionDiagnostic,
} from "../../e2e/helpers/oneTentActionQueueTransitionDiagnostic";

describe("authenticated One-Tent Action Queue transition diagnostic", () => {
  it("matches only the exact PostgREST transition RPC response", () => {
    expect(
      isActionQueueTransitionResponse(
        "POST",
        "https://example.supabase.co/rest/v1/rpc/action_queue_transition",
      ),
    ).toBe(true);
    expect(
      isActionQueueTransitionResponse(
        "POST",
        "https://example.supabase.co/rest/v1/rpc/action_queue_transition?ignored=1",
      ),
    ).toBe(true);
    expect(
      isActionQueueTransitionResponse(
        "GET",
        "https://example.supabase.co/rest/v1/rpc/action_queue_transition",
      ),
    ).toBe(false);
    expect(
      isActionQueueTransitionResponse(
        "POST",
        "https://example.supabase.co/rest/v1/rpc/action_queue_transition_v2",
      ),
    ).toBe(false);
    expect(isActionQueueTransitionResponse("POST", "not a URL")).toBe(false);
  });

  it("records a successful response without retaining identifiers or timestamps", () => {
    const diagnostic = buildActionQueueTransitionDiagnostic(200, {
      ok: true,
      action_queue_id: "3d077c7c-1af7-4f0b-b106-63cd28c3a493",
      event_id: "0eff6a48-792a-4849-a236-19f1fa9206de",
      transitioned_at: "2030-01-01T00:00:00.000Z",
      reused: false,
    });

    expect(diagnostic).toEqual({
      observed: true,
      http_status: 200,
      body_kind: "success",
      ok: true,
      reason: null,
      code: null,
    });
    expect(deriveActionQueueTransitionBlockerReason(diagnostic)).toBeNull();
    expect(renderActionQueueTransitionDiagnostic(diagnostic)).not.toMatch(
      /3d077c7c|0eff6a48|2030-01-01/,
    );
  });

  it("allowlists expected failure reasons and rejects attacker-controlled fields", () => {
    const diagnostic = buildActionQueueTransitionDiagnostic(200, {
      ok: false,
      reason: "status_conflict",
      message: "token=secret",
      details: "https://internal.invalid/row/uuid",
      hint: "Authorization: Bearer private",
      action_queue_id: "3d077c7c-1af7-4f0b-b106-63cd28c3a493",
    });

    expect(diagnostic).toEqual({
      observed: true,
      http_status: 200,
      body_kind: "expected_failure",
      ok: false,
      reason: "status_conflict",
      code: null,
    });
    expect(deriveActionQueueTransitionBlockerReason(diagnostic)).toBe(
      "action_queue_transition_status_conflict",
    );
    const rendered = renderActionQueueTransitionDiagnostic(diagnostic);
    expect(rendered).not.toMatch(/secret|internal|Authorization|Bearer|3d077c7c/i);
  });

  it("classifies an unavailable RPC from only its safe PostgREST code", () => {
    const diagnostic = buildActionQueueTransitionDiagnostic(404, {
      code: "PGRST202",
      message: "Could not find function public.action_queue_transition",
      details: "private schema details",
      hint: "reload schema cache",
    });

    expect(diagnostic).toEqual({
      observed: true,
      http_status: 404,
      body_kind: "error",
      ok: null,
      reason: null,
      code: "PGRST202",
    });
    expect(deriveActionQueueTransitionBlockerReason(diagnostic)).toBe(
      "action_queue_transition_unavailable",
    );
    expect(renderActionQueueTransitionDiagnostic(diagnostic)).not.toMatch(
      /function|schema|details|hint/i,
    );
  });

  it("drops unknown codes and reasons into fixed fail-closed classifications", () => {
    const malformed = buildActionQueueTransitionDiagnostic(200, {
      ok: false,
      reason: "database_said_secret",
      code: "ATTACKER_CONTROLLED",
    });
    expect(malformed).toEqual({
      observed: true,
      http_status: 200,
      body_kind: "malformed",
      ok: null,
      reason: null,
      code: null,
    });
    expect(deriveActionQueueTransitionBlockerReason(malformed)).toBe(
      "action_queue_transition_malformed_response",
    );

    const forbidden = buildActionQueueTransitionDiagnostic(403, { code: "42501" });
    expect(deriveActionQueueTransitionBlockerReason(forbidden)).toBe(
      "action_queue_transition_forbidden",
    );

    const generic = buildActionQueueTransitionDiagnostic(503, { message: "private" });
    expect(deriveActionQueueTransitionBlockerReason(generic)).toBe(
      "action_queue_transition_http_error",
    );
  });

  it("renders deterministically with a fixed unobserved diagnostic", () => {
    const diagnostic = buildActionQueueTransitionDiagnostic(null, null);
    expect(diagnostic).toEqual({
      observed: false,
      http_status: null,
      body_kind: "unobserved",
      ok: null,
      reason: null,
      code: null,
    });
    expect(renderActionQueueTransitionDiagnostic(diagnostic)).toBe(
      renderActionQueueTransitionDiagnostic(diagnostic),
    );
    expect(deriveActionQueueTransitionBlockerReason(diagnostic)).toBe(
      "action_queue_transition_not_observed",
    );
  });
});
