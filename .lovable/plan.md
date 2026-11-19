# Stop repeated diary and sensor-reading loads

No code has changed yet. This plan is for review first.

## What causes the repeats
1. **Data is treated as out of date the moment it loads.** Every page open, tab switch or reconnect loads the full diary and sensor lists again. Nothing sets how long loaded data stays fresh (`src/router.tsx`).
2. **The Dashboard loads the same data several times.** Three panels each load the diary, and they ask for different amounts of sensor history (200 rows on one, 500 on two others), so those loads can't be shared.
3. **One tent and several tents are filed under different names.** Reading one tent and reading several tents at once don't reuse each other's results, even for the same tent.
4. **Saving a Quick Log triggers a second reload.** After the save reloads the diary, every open panel reloads the diary *and* all sensor readings again.
5. **Live sensor updates reload every half second** while readings are streaming in.

Also found: the diary loads the whole history with no limit, and its saved results aren't tied to the signed-in account. Both matter before keeping results longer.

## Changes (front end only; no database, sign-in or AI changes)
- `src/router.tsx`: keep loaded data fresh for 60 seconds, and stop reloading when you switch back to the tab. Saves still refresh straight away.
- `src/hooks/use-diary-entries.ts`: file diary results under the signed-in account, and wait until sign-in is ready.
- `src/hooks/use-sensor-readings.ts`: file one-tent reads the same way as several-tent reads, so they share results.
- `src/components/GuidedActionChecklistPanel.tsx`: don't load the diary until a grow is chosen.
- `src/lib/dailyCheckRefreshRules.ts`, `DashboardDailyGrowCheckPanel.tsx`, `PlantDailyGrowCheckConsistencyCard.tsx`: after a save, refresh only once and only what changed: a diary save refreshes the diary, a sensor save refreshes sensor readings. Overlapping refreshes merge into one.
- `src/lib/sensor.ts`: live sensor updates refresh at most once every 30 seconds per tent.
- Not in this change: sharing one sensor-history size across Dashboard panels, and limiting the full diary load. Both change what the panels show and need their own decision.

## Tests
New tests in `src/test/`:
- freshness defaults
- account-scoped diary results
- one tent sharing results with several tents
- one refresh per save
- the 30-second live-update limit

Each test will be shown failing before the fix. Then run the existing Quick Log, daily-check and sensor tests, plus a typecheck.

## Safety and rollback
- Sensor labels and the "approval required" queue stay unchanged.
- Data never shows as live when it isn't.
- Undoing it means reverting one commit. Database savings will show only after the live site picks up the change; measure server hours a week later.

## On hold (AI Doctor / Coach switch)
- I can't create a branch from here, so the change would go on the current one. That needs your OK.
- The AI Doctor redeploy needs five missing secrets.
- I won't touch GEMINI_API_KEY and will ask before deleting it.
