import { describe, it, expect } from "vitest";
import {
  diagnoseResetLink,
  RESTART_FLOW_HREF,
} from "@/lib/resetPasswordLinkRules";

describe("resetPasswordLinkRules", () => {
  it("returns 'ready' when a session exists and no error is in the URL", () => {
    const d = diagnoseResetLink({ hash: "", search: "", hasSession: true });
    expect(d.status).toBe("ready");
  });

  it("returns 'missing' when there is no session and no URL error", () => {
    const d = diagnoseResetLink({ hash: "", search: "", hasSession: false });
    expect(d.status).toBe("missing");
    expect(d.ctaLabel.length).toBeGreaterThan(0);
  });

  it("classifies otp_expired in the hash as 'expired'", () => {
    const d = diagnoseResetLink({
      hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      search: "",
      hasSession: false,
    });
    expect(d.status).toBe("expired");
  });

  it("classifies expired code in the query string as 'expired'", () => {
    const d = diagnoseResetLink({
      hash: "",
      search: "?error=access_denied&error_code=otp_expired",
      hasSession: false,
    });
    expect(d.status).toBe("expired");
  });

  it("classifies any 'expired' description as expired even without a code", () => {
    const d = diagnoseResetLink({
      hash: "#error_description=Token+has+expired",
      search: "",
      hasSession: false,
    });
    expect(d.status).toBe("expired");
  });

  it("classifies unknown error codes as 'invalid'", () => {
    const d = diagnoseResetLink({
      hash: "#error=access_denied&error_code=invalid_request",
      search: "",
      hasSession: false,
    });
    expect(d.status).toBe("invalid");
  });

  it("prefers an error signal over an active session (link was consumed but errored)", () => {
    const d = diagnoseResetLink({
      hash: "#error=access_denied&error_code=otp_expired",
      search: "",
      hasSession: true,
    });
    expect(d.status).toBe("expired");
  });

  it("tolerates hash/search without leading punctuation", () => {
    const d = diagnoseResetLink({
      hash: "error_code=otp_expired",
      search: "error_code=otp_expired",
      hasSession: false,
    });
    expect(d.status).toBe("expired");
  });

  it("null/undefined URL parts fall through to session check", () => {
    expect(diagnoseResetLink({ hash: null, search: null, hasSession: true }).status).toBe("ready");
    expect(diagnoseResetLink({ hash: undefined, search: undefined, hasSession: false }).status).toBe(
      "missing",
    );
  });

  it("restart href points at the forgot-password tab", () => {
    expect(RESTART_FLOW_HREF).toBe("/auth?mode=forgot");
  });
});
