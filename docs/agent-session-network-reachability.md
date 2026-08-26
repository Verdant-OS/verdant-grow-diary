# Agent-session network reachability — how to check production, and how not to

**Purpose:** a production-liveness claim must never rest on a DNS or socket failure
observed inside an agent sandbox. This document records the failure that produced it,
the reason the negative was false, and the procedure that was actually verified.

This is a durable reference, not a governance file. It carries no `Sentinel-Version`
and is not one of the twelve versioned governance documents.

---

## 1. The failure this document exists to prevent

On 2026-08-20 an agent ran, inside a code-execution sandbox:

```python
socket.gethostbyname('verdantgrowdiary.com')
# [Errno -3] Temporary failure in name resolution
```

and reported from it that `verdantgrowdiary.com` was **offline and not indexed**, then
recommended pointing the domain's DNS records at a deployment host.

Production was live throughout, serving a build published earlier the same day. The
recommended remediation targeted a defect that did not exist, and would have been
applied to working DNS.

The error string is the tell. `Temporary failure in name resolution` is `EAI_AGAIN` —
**the resolver did not answer**. It is not `NXDOMAIN`, which is what an unregistered or
unpointed domain returns. Those two outcomes look equally like "it didn't work" and mean
opposite things: one measures the caller's network, the other measures the domain.

## 2. Why the negative was false

Agent environments differ in their egress, and the difference is invisible from inside
the failing call:

| Environment                       | DNS from the process          | Outbound HTTP                         |
| --------------------------------- | ----------------------------- | ------------------------------------- |
| Code-execution / analysis sandbox | none — no resolver, no egress | none                                  |
| Claude Code remote session        | system resolver present       | via the agent proxy on `$HTTPS_PROXY` |

In a Claude Code remote session the proxy also resolves hostnames on the caller's behalf
(`CLAUDE_CODE_PROXY_RESOLVES_HOSTS=true`), so a request can succeed even where a direct
resolver call would not. A liveness check therefore belongs at the HTTP layer, through
the proxy — never at the socket layer.

## 3. The rule

Three outcomes, kept distinct. Per the status vocabulary in `AGENTS.md`:

- **`PASS` / `FAIL`** — an HTTP response was received and read. Only these two are
  measurements of the site.
- **`BLOCKED`** — the request never reached the origin: proxy `403`, connection refused,
  resolver failure, missing credential. This measures the session.
- **Never** derive `FAIL` from a resolver error, and never derive "offline",
  "unindexed", or "not deployed" from one.

`BLOCKED` is also **per-session, not permanent**. `CURRENT_STATE.md` recorded a
`/version.json` fetch as `BLOCKED` (network policy `403`) on 2026-08-18; the identical
fetch returned `200` on 2026-08-20 from a different session. Re-test before carrying a
`BLOCKED` forward as though it were a property of the target.

## 4. Verified procedure

Every command below was run successfully on 2026-08-20 from a Claude Code remote session.

```bash
# 1. Does the session resolve at all? Always pair the target with a control host —
#    a failure on both is a session fault, not a target fault.
getent hosts verdantgrowdiary.com
getent hosts github.com

# 2. Release identity. This is the authoritative liveness + provenance check.
curl -sS -m 25 -w 'http=%{http_code}\n' https://verdantgrowdiary.com/version.json

# 3. Public SEO surfaces.
for u in / /robots.txt /sitemap.xml; do
  curl -sS -m 25 -o /dev/null -w "$u http=%{http_code}\n" "https://verdantgrowdiary.com$u"
done

# 4. Confirm the served build is a real commit from this repo, not a stamp.
node scripts/resolve-release-provenance.mjs --hash=<treeHash> --ref=<shortCommit> --scan=1
```

## 5. Reading the output correctly

- **`%{remote_ip}` is the proxy, not the origin.** It reports `127.0.0.1` — the local
  proxy listener. Never record it as the site's address. Use `getent` for the real A
  record.
- **The landing page HTML contains NUL bytes.** `grep` reports `binary file matches` and
  suppresses output. Filter with `tr -d '\0'` first, or pass `grep -a`.
- **Body word counts are method-sensitive.** Stripping tags and `<script>` blocks and
  then counting yields materially different totals depending on whether tokens carrying
  digits or punctuation are included. Record the method alongside the number, and do not
  read a difference against an earlier count as content loss unless the method matched.

## 6. What this procedure does not establish

- **Not indexation.** Presence in a third-party web index is a `practical observation`.
  It is not an authenticated Google Search Console measurement, and it licenses no
  claim about impressions, clicks, position, or CTR. The GA4 and GSC authenticated
  baselines remain `BLOCKED` — see the blockers in `docs/agents/CURRENT_STATE.md`.
- **Not migration state.** HTTP liveness says nothing about which migrations are
  applied. Publishing deploys the frontend and edge functions only.
- **Not a continuous signal.** A single fetch is point-in-time. It does not replace the
  migration-drift probe or any scheduled gate.
