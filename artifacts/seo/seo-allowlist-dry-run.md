# SEO Allowlist Dry Run

No Google Search Console API calls were made.

Allowlist: `/dev-server/config/seo-allowlist.json`

## Totals
- URLs simulated: **2**
- Suppressed: **1**
- Expected-noindex: **0**
- Never-allowlisted: **1**
- Expired-allowlist matches: **0**
- Unsuppressed / no-match: **0**
- Expired allowlist entries (any URL): **0**

## Per-URL breakdown

### https://verdantgrowdiary.com/
- **Classification:** `never_allowlisted`
- **Never-allowlisted:** yes
- **Matched allowlisted_issues:** —
- **Matched expected_noindex:** —
- **Matched expired entries:** —
- **Would suppress issue types:** —
- **Suppression active:** no
- **Never-allowlist overrides suppression:** yes
- **Reasons:**
  - URL is in never_allowlist — critical, never suppressed

### https://verdantgrowdiary.com/auth/callback
- **Classification:** `suppressed`
- **Never-allowlisted:** no
- **Matched allowlisted_issues:** `auth-routes-expected-non-indexable`
- **Matched expected_noindex:** `protected-routes-noindex`
- **Matched expired entries:** —
- **Would suppress issue types:** not_indexed, noindex_detected, blocked_by_robots, verdict_not_pass
- **Suppression active:** yes
- **Never-allowlist overrides suppression:** no
- **Reasons:**
  - allowlisted_issues[auth-routes-expected-non-indexable] would suppress: not_indexed, noindex_detected, blocked_by_robots, verdict_not_pass
  - expected_noindex[protected-routes-noindex] applies

## Expired allowlist entries
None.
