import { describe, it, expect } from "vitest";
import {
  buildCopyableTraceLinkFromHighlight,
  buildCopyableTraceLinkFromDiaryDetails,
  copyTraceLinkToClipboard,
  COPY_TRACE_LINK_LABEL,
  COPY_TRACE_LINK_SUCCESS_COPY,
  COPY_TRACE_LINK_FAILURE_COPY,
} from "@/lib/actionQueueTraceLinkCopyRules";

describe("buildCopyableTraceLinkFromHighlight", () => {
  it("returns null for missing/malformed tokens", () => {
    expect(buildCopyableTraceLinkFromHighlight(null)).toBeNull();
    expect(buildCopyableTraceLinkFromHighlight("")).toBeNull();
    expect(buildCopyableTraceLinkFromHighlight("garbage")).toBeNull();
    expect(buildCopyableTraceLinkFromHighlight("action-queue:bad id:approved")).toBeNull();
    expect(buildCopyableTraceLinkFromHighlight("action-queue:aq-1:other")).toBeNull();
    expect(buildCopyableTraceLinkFromHighlight("alerts:aq-1:approved")).toBeNull();
  });

  it("builds a same-origin absolute URL when origin is supplied", () => {
    const link = buildCopyableTraceLinkFromHighlight("action-queue:aq-42:approved", {
      origin: "https://verdantgrowdiary.com",
    });
    expect(link).not.toBeNull();
    expect(link!.url).toBe(
      "https://verdantgrowdiary.com/actions?highlight=action-queue%3Aaq-42%3Aapproved",
    );
    expect(link!.relativePath).toBe(
      "/actions?highlight=action-queue%3Aaq-42%3Aapproved",
    );
  });

  it("falls back to a relative path when origin is unavailable", () => {
    const link = buildCopyableTraceLinkFromHighlight("action-queue:aq-1:rejected", {
      origin: null,
    });
    expect(link!.url).toBe("/actions?highlight=action-queue%3Aaq-1%3Arejected");
  });

  it("merges highlight into a safe actionsReturn path", () => {
    const link = buildCopyableTraceLinkFromHighlight("action-queue:aq-9:approved", {
      origin: "https://app.example.com",
      actionsReturn: "/actions?status=approved&page=3",
    });
    const qs = new URLSearchParams(link!.relativePath.split("?")[1]);
    expect(qs.get("status")).toBe("approved");
    expect(qs.get("page")).toBe("3");
    expect(qs.get("highlight")).toBe("action-queue:aq-9:approved");
    expect(link!.url.startsWith("https://app.example.com/actions?")).toBe(true);
  });

  it("ignores unsafe actionsReturn values", () => {
    const link = buildCopyableTraceLinkFromHighlight("action-queue:aq-9:approved", {
      actionsReturn: "https://evil.example.com/actions",
    });
    expect(link!.relativePath).toBe(
      "/actions?highlight=action-queue%3Aaq-9%3Aapproved",
    );
  });

  it("visible label never includes raw IDs", () => {
    expect(COPY_TRACE_LINK_LABEL).not.toMatch(/aq-|[0-9a-f]{8}-/i);
    expect(COPY_TRACE_LINK_SUCCESS_COPY).not.toMatch(/aq-|[0-9a-f]{8}-/i);
    expect(COPY_TRACE_LINK_FAILURE_COPY).not.toMatch(/aq-|[0-9a-f]{8}-/i);
  });
});

describe("buildCopyableTraceLinkFromDiaryDetails", () => {
  it("returns null for non-action_queue_trace entries", () => {
    expect(
      buildCopyableTraceLinkFromDiaryDetails({
        kind: "note",
        idempotency_key: "action-queue:aq-1:approved",
      }),
    ).toBeNull();
    expect(buildCopyableTraceLinkFromDiaryDetails(null)).toBeNull();
  });

  it("returns null for invalid idempotency keys", () => {
    expect(
      buildCopyableTraceLinkFromDiaryDetails({
        kind: "action_queue_trace",
        idempotency_key: "garbage",
      }),
    ).toBeNull();
  });

  it("builds a link for valid action_queue_trace details", () => {
    const link = buildCopyableTraceLinkFromDiaryDetails(
      { kind: "action_queue_trace", idempotency_key: "action-queue:aq-1:approved" },
      { origin: "https://x.test" },
    );
    expect(link!.url).toBe(
      "https://x.test/actions?highlight=action-queue%3Aaq-1%3Aapproved",
    );
  });
});

describe("copyTraceLinkToClipboard", () => {
  it("returns 'success' when clipboard.writeText resolves", async () => {
    const calls: string[] = [];
    const result = await copyTraceLinkToClipboard("/actions?highlight=action-queue:aq-1:approved", {
      writeText: async (v) => {
        calls.push(v);
      },
    });
    expect(result).toBe("success");
    expect(calls).toEqual(["/actions?highlight=action-queue:aq-1:approved"]);
  });

  it("returns 'failure' when clipboard is unavailable", async () => {
    const result = await copyTraceLinkToClipboard("/actions?highlight=action-queue:aq-1:approved", null);
    expect(result).toBe("failure");
  });

  it("returns 'failure' when writeText rejects (no crash)", async () => {
    const result = await copyTraceLinkToClipboard("/x", {
      writeText: async () => {
        throw new Error("boom");
      },
    });
    expect(result).toBe("failure");
  });

  it("returns 'failure' for empty url", async () => {
    const result = await copyTraceLinkToClipboard("", {
      writeText: async () => {},
    });
    expect(result).toBe("failure");
  });
});
