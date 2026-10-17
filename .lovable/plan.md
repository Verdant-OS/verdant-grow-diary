# Billing environment check — read-only findings

No files, secrets, settings or deployments were changed.

## 1. Function logs
- get-paddle-price, payments-webhook, paddle-webhook, redeem-referral: NO_DATA. The log tool found no entries for any of them, with or without the "environment" or "price_resolution_unavailable" filter.
- The tool only covers a short recent window, not 14 days, so older lines are NOT_MEASURED.
- Only founder-slots-remaining has recent logs (2026-10-17 01:45–01:46 UTC). It names no billing environment. It shows deploy_version `..._112` and repeated `metric_persist_failed` status 400 warnings (metrics not saving; requests themselves succeed).

## 2. Deployed function list with versions
BLOCKED: I have no tool that lists deployed functions with version numbers and last-deployed times. The only version I can see is in log lines, which exist for founder-slots-remaining only (version 112).

## 3. Verdict
Which billing environment production resolves: NOT_MEASURED. No log line in reach says it.

## Possible next step (needs your approval)
A single checkout attempt on /pricing would make get-paddle-price write a log line. I could read it afterwards, without changing anything.
