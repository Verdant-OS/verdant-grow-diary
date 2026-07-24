import { describe, expect, it } from "vitest";

import { resolveSignupCompletionDisposition } from "@/lib/signupCompletionRules";

describe("signup completion rules", () => {
  it("continues immediately only when Supabase returned an authenticated session", () => {
    expect(resolveSignupCompletionDisposition({ session: { access_token: "present" } })).toBe(
      "authenticated",
    );
  });

  it.each([null, undefined, {}, { session: null }])(
    "fails incomplete signup data closed to verification: %p",
    (data) => {
      expect(resolveSignupCompletionDisposition(data)).toBe("verification_required");
    },
  );

  it("is deterministic", () => {
    const data = { session: null };
    expect(resolveSignupCompletionDisposition(data)).toBe(resolveSignupCompletionDisposition(data));
  });
});
