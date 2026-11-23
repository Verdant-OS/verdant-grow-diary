# Diagnosis: ai-doctor-review / ai-coach failures, 2026-11-23 17:38–17:45 UTC

Read-only. Nothing was changed.

## What the logs show
- ai-doctor-review: one line in the window, `2026-11-23T17:44:09Z LOG shutdown`.
- ai-coach: one line in the window, `2026-11-23T17:45:16Z LOG shutdown`.
- No `status=` lines from either function (no config_missing, credit_rpc_error, prompt_hmac_unavailable, parse or shape failures).
- Request logs with HTTP status codes and per-request function logs came back empty. That table returned no rows at all, even without a time filter. HTTP status codes: NOT_MEASURED.

## Answers
1. Received? Partly. Each function started at least once (the shutdown event proves that). Whether all three requests reached the code, and their HTTP codes: NOT_MEASURED.
2. Exact log lines: only the two shutdown lines above. No `status=` lines were printed.
3. Deployed version matches the repo? NOT_MEASURED. The logs don't show a deploy ID or time. In the repo, the last change touching these functions or their shared code is `9c7339428` (2026-11-23 15:04 UTC). I can't tell whether that change was ever deployed.
4. Cause:
   - Evidence: both functions have `verify_jwt = true`. Every config_missing, credit, and HMAC path logs a `status=` line before it returns, and none appeared.
   - Guess (most likely): the requests were rejected before those checks ran. Either the platform rejected the sign-in token, which gives a 401 before the code runs, or the code failed on its own sign-in check or a CORS preflight, which don't log a `status=` line. The live site uses a separate frontend (Cloudflare). If it sends a token from a different sign-in project, or no token, you would see exactly this.
   - Guess (less likely): the deployed versions are older than the repo and don't log these lines.

## Suggested next steps (need approval; still read-only)
- Look at the browser's network tab on the live site for the failing calls: the response code and body (401 "Invalid JWT" vs a JSON error).
- Ask me to check the live site's /version.json and which backend address it calls.
