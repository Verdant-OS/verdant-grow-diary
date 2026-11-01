import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { SignupEmail } from "@/lib/email-templates/signup";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";

describe("authentication email payload safety", () => {
  const confirmationUrl = "https://example.test/auth?token=test-only&action=confirm";

  it("preserves the supplied signup confirmation link without rebuilding its token", async () => {
    const html = await render(createElement(SignupEmail, {
      siteName: "Verdant Grow Diary", siteUrl: "https://example.test",
      recipient: "reader@example.test", confirmationUrl,
    }));
    expect(html).toContain('href="https://example.test/auth?token=test-only&amp;action=confirm"');
  });

  it("preserves the supplied password recovery link", async () => {
    const html = await render(createElement(RecoveryEmail, { siteName: "Verdant Grow Diary", confirmationUrl }));
    expect(html).toContain('href="https://example.test/auth?token=test-only&amp;action=confirm"');
  });

  it("keeps old and new email addresses distinct and escapes untrusted address text", async () => {
    const html = await render(createElement(EmailChangeEmail, {
      siteName: "Verdant Grow Diary", oldEmail: "old@example.test",
      email: "new@example.test", newEmail: "<script>alert(1)</script>@example.test", confirmationUrl,
    }));
    expect(html).toContain("old@example.test");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;@example.test");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders the supplied verification code instead of generating a replacement", async () => {
    const text = await render(createElement(ReauthenticationEmail, { token: "987654" }), { plainText: true });
    expect(text).toContain("987654");
    expect(text).not.toContain("123456");
  });
});