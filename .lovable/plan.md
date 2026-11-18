# Read-only answers: sign-in email hook (no changes proposed)

Nothing will be changed. This holds only the answers to your four questions.

1. **Send Email hook on Auth:** UNKNOWN / BLOCKED. None of my tools can read the Auth hook configuration (whether it is enabled or what URL it points at). Indirect evidence (from earlier, not re-measured): Cloud > Emails shows "No authentication emails yet". The hook ran 0 times during the 14:57 UTC password reset on Nov 12. That suggests no active hook points at `auth-email-hook`, but it does not prove it. Whether a managed Emails hook targets `/lovable/email/auth/webhook` is also NOT_MEASURED. That route is in the code but has not been published.

2. **Secret names:**
   - SEND_EMAIL_HOOK_SECRET: missing
   - LOVABLE_API_KEY: present (managed)
   - LOVABLE_SEND_URL: missing. The code reads it as optional and falls back when it is empty.

3. **Setting SEND_EMAIL_HOOK_SECRET safely:** You can't see this project's Auth hooks, so you have no "v1,whsec_..." value to copy. On Lovable Cloud the hook's secret is created by the platform and is not shown to me or to you. I have no tool that shows it or creates a matching hook. A secure secret form would only store a value you already have. It can't make that value match a hook secret nobody can read. The managed route for sign-in emails is the platform's own Emails setup, not this native-hook path. If you want the native path anyway, staff would need to configure the hook and give you its secret for Project Settings → Secrets.

4. **Deployed version:** I last redeployed `auth-email-hook` at 2026-11-12 14:08 UTC from code at `a6be0915`. The native-hook support came later in commits `c1cf32d30`, `d7a5d775d` and `cb79b7edf` (all 2026-11-16). So the deployed function is most likely older and lacks native-hook support. I can't list deploy history, so it's possible someone else deployed it since; this is NOT_MEASURED.
