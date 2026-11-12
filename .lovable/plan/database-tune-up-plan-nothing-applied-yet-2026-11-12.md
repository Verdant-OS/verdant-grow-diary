# Database tune-up plan (nothing applied yet)

## What I measured (read-only, Oct 30 - Nov 12)
- Database compute: 114 instance-hours, about 19.2 credits. This is the biggest running cost. Functions cost about 3.5 credits, network about 0.9 and storage under 0.1.
- Health is fine: memory at 44%, disk at 8%, low connections, no overload alerts.
- The top slow query loads the latest sensor readings for a tent through the "effective readings" view. It ran 87k times at about 66 ms each, about 96 minutes in total, and some runs took up to 8 s. The same query for several tents at once averages 750 ms.
- Next come the diary list queries: about 320k calls at about 3.7 ms each, and one variant at 82 ms.

## Likely cause (unconfirmed until I check the query plan)
The view runs a correction lookup for every reading a tent has before it sorts and keeps the newest few. There are about 317k readings. The sort order also doesn't match the existing index, because missing dates are sorted last.

## Proposed fix
1. Check the query plan, read-only, to confirm the cause.
2. Add one new, additive migration file that creates indexes only:
   - one sensor-readings index that matches the newest-first order
   - one diary index on entry date that skips retracted entries
3. If the indexes don't help much, change how the app asks for the newest readings. Because this changes code, it would come back to you as a separate plan first.
4. Re-measure query time afterwards. Compute savings can only be claimed if active hours actually drop.

## What this does NOT touch
- The email_infra migration file: no edits, rewrite or delete. Existing migration files stay byte-for-byte unchanged.
- The sign-in email hook (auth-email-hook): no edits and no redeploy.
- No table, data, queue, cron job or setting changes. Nothing is deployed or published.

## Needs your OK
Your project rules lock live database writes. Approving this plan is the go-ahead for that one index-only migration.
