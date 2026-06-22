import { describe, it, expect } from "vitest";
import {
  buildViewInActionsLinkFromDiaryDetails,
  VIEW_IN_ACTIONS_LABEL,
  buildActionDiaryTraceLink,
} from "@/lib/actionQueueTimelineLinkRules";

describe("buildViewInActionsLinkFromDiaryDetails", () => {
  it("returns null for non-action_queue_trace entries", () => {
    expect(
      buildViewInActionsLinkFromDiaryDetails({
        kind: "note",
        idempotency_key: "action-queue:aq-1:approved",
      }),
    ).toBeNull();
    expect(buildViewInActionsLinkFromDiaryDetails(null)).toBeNull();
    expect(buildViewInActionsLinkFromDiaryDetails(undefined)).toBeNull();
  });

  it("returns null when idempotency_key is missing or malformed", () => {
    expect(
      buildViewInActionsLinkFromDiaryDetails({
        kind: "action_queue_trace",
      }),
    ).toBeNull();
    expect(
      buildViewInActionsLinkFromDiaryDetails({
        kind: "action_queue_trace",
        idempotency_key: "garbage",
      }),
    ).toBeNull();
    expect(
      buildViewInActionsLinkFromDiaryDetails({
        kind: "action_queue_trace",
        idempotency_key: "action-queue:bad id:approved",
      }),
    ).toBeNull();
    expect(
      buildViewInActionsLinkFromDiaryDetails({
        kind: "action_queue_trace",
        idempotency_key: "action-queue:aq-1:other",
      }),
    ).toBeNull();
  });

  it("builds a default /actions?highlight=... link when no actionsReturn is supplied", () => {
    const link = buildViewInActionsLinkFromDiaryDetails({
      kind: "action_queue_trace",
      idempotency_key: "action-queue:aq-42:approved",
    });
    expect(link).not.toBeNull();
    expect(link!.href).toBe("/actions?highlight=action-queue%3Aaq-42%3Aapproved");
    expect(link!.label).toBe(VIEW_IN_ACTIONS_LABEL);
  });

  it("uses the safe actionsReturn path and merges/overrides its highlight", () => {
    const link = buildViewInActionsLinkFromDiaryDetails(
      {
        kind: "action_queue_trace",
        idempotency_key: "action-queue:aq-42:approved",
      },
      { actionsReturn: "/actions?status=approved&page=2&highlight=stale" },
    );
    expect(link).not.toBeNull();
    expect(link!.href.startsWith("/actions?")).toBe(true);
    const qs = new URLSearchParams(link!.href.split("?")[1]);
    expect(qs.get("status")).toBe("approved");
    expect(qs.get("page")).toBe("2");
    expect(qs.get("highlight")).toBe("action-queue:aq-42:approved");
  });

  it("ignores unsafe actionsReturn values and falls back to default", () => {
    const link = buildViewInActionsLinkFromDiaryDetails(
      {
        kind: "action_queue_trace",
        idempotency_key: "action-queue:aq-7:rejected",
      },
      { actionsReturn: "https://evil.example.com/actions" },
    );
    expect(link!.href).toBe("/actions?highlight=action-queue%3Aaq-7%3Arejected");
  });

  it("visible label never contains raw IDs", () => {
    expect(VIEW_IN_ACTIONS_LABEL).not.toMatch(/aq-|[0-9a-f]{8}-/i);
  });
});

describe("buildActionDiaryTraceLink with currentActionsParams", () => {
  it("includes actionsReturn when current /actions URL state is non-default", () => {
    const params = new URLSearchParams("status=approved&page=3&junk=drop");
    const link = buildActionDiaryTraceLink({
      status: "approved",
      actionId: "aq-9",
      currentActionsParams: params,
    });
    expect(link).not.toBeNull();
    const qs = new URLSearchParams(link!.href.split("?")[1]);
    expect(qs.get("highlight")).toBe("action-queue:aq-9:approved");
    const ret = qs.get("actionsReturn");
    expect(ret).not.toBeNull();
    expect(ret!.startsWith("/actions?")).toBe(true);
    // Unsupported param dropped.
    expect(ret).not.toContain("junk");
    expect(link!.actionsReturn).toBe(ret);
  });

  it("omits actionsReturn when no currentActionsParams supplied", () => {
    const link = buildActionDiaryTraceLink({
      status: "rejected",
      actionId: "aq-9",
    });
    expect(link).not.toBeNull();
    expect(link!.href).not.toContain("actionsReturn");
    expect(link!.actionsReturn).toBeUndefined();
  });

  it("omits actionsReturn when current params produce a bare /actions path", () => {
    const link = buildActionDiaryTraceLink({
      status: "approved",
      actionId: "aq-9",
      currentActionsParams: new URLSearchParams("ignored=1"),
    });
    expect(link!.href).not.toContain("actionsReturn");
  });
});
