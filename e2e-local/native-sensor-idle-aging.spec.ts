import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  acceptedReceipt,
  createLocalFixture,
  fenceBrowser,
  fingerprint,
  localEnvironment,
  ownerRows,
  signIn,
  visibleEventIds,
  witnessRows,
} from "./lib/nativeLocalFixtures";

for (const source of ["live", "manual"] as const) {
  for (const observedVpd of [true, false]) {
    test(`${source} ${observedVpd ? "observed" : "derived"} VPD ages without writes and survives reopening`, async ({
      page,
      context,
    }) => {
      const f = await createLocalFixture();
      try {
        await fenceBrowser(context, f.env);
        await signIn(page, f);
        const env = localEnvironment();
        const admin = createClient(env.api, env.service, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: async (input, init) => {
              const request = new Request(input, init);
              if (new URL(request.url).origin !== env.api)
                throw new Error("Non-local seed blocked");
              return fetch(request, { redirect: "error" });
            },
          },
        });
        const now = Date.now();
        const capturedAt = new Date(now - (source === "live" ? 11 : 1436) * 60_000).toISOString();
        const metrics = [
          { metric: "temperature_c", value: 25 },
          { metric: "humidity_pct", value: 55 },
          ...(observedVpd ? [{ metric: "vpd_kpa", value: 1.2 }] : []),
        ];
        const { error } = await admin.from("sensor_readings").insert(
          metrics.map((metric) => ({
            ...metric,
            user_id: f.owner.id,
            tent_id: f.primary.tentId,
            source,
            captured_at: capturedAt,
            ts: capturedAt,
            quality: "ok",
            raw_payload:
              source === "live"
                ? {
                    vendor: "ecowitt_windows_testbench",
                    metadata: {
                      reported_verdant_source: "live",
                      raw_payload: { stationtype: "GW2000", model: "GW2000" },
                    },
                  }
                : { fixture: "native-local-manual" },
          })),
        );
        if (error) throw new Error("Local idle-aging seed failed");
        const before = await ownerRows(f.owner);
        const otherBefore = await witnessRows(f);
        const own = before.sensor_readings.filter((row) => row.tent_id === f.primary.tentId);
        expect(own).toHaveLength(metrics.length);
        expect(
          own.every(
            (row) =>
              row.source === source &&
              Date.parse(String(row.captured_at)) === Date.parse(capturedAt),
          ),
        ).toBe(true);
        await page.clock.install({ time: new Date(now) });
        const url = `${env.ui}/sensors?tentId=${f.primary.tentId}&tentIntent=required`;
        await page.goto(url);
        const temp = page.getByTestId("sensors-metric-state-temp");
        const vpd = page.getByTestId("sensors-metric-state-vpd");
        await expect(temp).toHaveAttribute("data-kind", source);
        await expect(vpd).toHaveAttribute("data-kind", observedVpd ? source : "derived");
        await expect(page.getByTestId("sensors-stage-status-temp")).toBeVisible();
        const exportCsv = async () => {
          const pending = page.waitForEvent("download");
          await page.getByTestId("sensor-chart-export-btn").first().click();
          const stream = await (await pending).createReadStream();
          if (!stream) throw new Error("Chart export missing");
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          return Buffer.concat(chunks).toString("utf8");
        };
        const originalCsv = await exportCsv();
        expect(originalCsv).toContain(`,${source},`);
        expect(originalCsv).toContain(observedVpd ? ",25,55,1.2," : ",25,55,,");
        await page.clock.fastForward(5 * 60_000);
        await expect(temp).toHaveAttribute("data-kind", "stale");
        await expect(vpd).toHaveAttribute("data-kind", "stale");
        await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(0);
        await expect(page.getByTestId("sensors-stage-status-rh")).toHaveCount(0);
        if (!observedVpd) await expect(page.getByTestId("sensors-vpd-derived-value")).toBeVisible();
        expect(await exportCsv()).toBe(
          originalCsv.replace(`,${source},usable,`, `,${source},stale,`),
        );
        await page.goto(`${env.ui}/plants/${f.primary.plantId}`);
        await page.goto(url);
        await expect(temp).toHaveAttribute("data-kind", "stale");
        await expect(vpd).toHaveAttribute("data-kind", observedVpd ? "stale" : "no_reading_yet");
        if (!observedVpd)
          await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(0);
        // Reload reclassifies persisted rows by age. Observed evidence remains
        // stale, but the established VPD selector refuses a new calculation
        // from stale inputs; a cached derivation must not become fresh again.
        const reopenedCsv = await exportCsv();
        const expectedReopenedCsv = originalCsv.replace(`,${source},usable,`, `,${source},stale,`);
        expect(reopenedCsv).toBe(expectedReopenedCsv);
        expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
        expect(fingerprint(await witnessRows(f))).toBe(fingerprint(otherBefore));
      } finally {
        await page.close();
        await f.cleanup();
      }
    });
  }
}

for (const source of ["live", "manual"] as const) {
  for (const quality of ["ok", "invalid"] as const) {
    test(`${source} future capture with quality=${quality} rechecks without refetch and survives reopening`, async ({
      page,
      context,
    }) => {
      const f = await createLocalFixture();
      try {
        await fenceBrowser(context, f.env);
        await signIn(page, f);
        const env = localEnvironment();
        const admin = createClient(env.api, env.service, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: async (input, init) => {
              const request = new Request(input, init);
              if (new URL(request.url).origin !== env.api)
                throw new Error("Non-local seed blocked");
              return fetch(request, { redirect: "error" });
            },
          },
        });
        // The database correctly rejects captures beyond its own five-minute
        // future fence. Model a slow browser clock with a valid persisted row;
        // do not bypass the database validator to manufacture future storage.
        const capturedAt = new Date(Date.now() - 60_000).toISOString();
        const now = Date.parse(capturedAt) - 10 * 60_000;
        const { error } = await admin.from("sensor_readings").insert(
          [
            { metric: "temperature_c", value: 25 },
            { metric: "humidity_pct", value: 55 },
          ].map((metric) => ({
            ...metric,
            user_id: f.owner.id,
            tent_id: f.primary.tentId,
            source,
            captured_at: capturedAt,
            ts: capturedAt,
            quality,
            raw_payload:
              source === "live"
                ? {
                    vendor: "ecowitt_windows_testbench",
                    metadata: {
                      reported_verdant_source: "live",
                      raw_payload: { stationtype: "GW2000", model: "GW2000" },
                    },
                  }
                : { fixture: "native-local-manual" },
          })),
        );
        if (error) throw new Error("Local clock-recovery seed failed");
        const before = await ownerRows(f.owner);
        const otherBefore = await witnessRows(f);
        const own = before.sensor_readings.filter((row) => row.tent_id === f.primary.tentId);
        expect(own).toHaveLength(2);
        expect(
          own.every(
            (row) =>
              row.source === source &&
              row.quality === quality &&
              Date.parse(String(row.captured_at)) === Date.parse(capturedAt),
          ),
        ).toBe(true);
        let sensorReads = 0;
        page.on("request", (request) => {
          if (new URL(request.url()).pathname === "/rest/v1/sensor_readings_effective")
            sensorReads++;
        });
        await page.clock.install({ time: new Date(now) });
        await page.goto(`${env.ui}/sensors?tentId=${f.primary.tentId}&tentIntent=required`);
        const temp = page.getByTestId("sensors-metric-state-temp");
        await expect(temp).toHaveAttribute("data-kind", "invalid");
        await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(0);
        await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(0);
        const readsBeforeClock = sensorReads;
        expect(readsBeforeClock).toBeGreaterThan(0);
        await page.clock.fastForward(6 * 60_000 + 1000);
        await expect(temp).toHaveAttribute("data-kind", quality === "ok" ? source : "invalid");
        expect(sensorReads).toBe(readsBeforeClock);
        if (quality === "ok") {
          await expect(page.getByTestId("sensors-stage-status-temp")).toBeVisible();
          await expect(page.getByTestId("sensors-vpd-derived-value")).toBeVisible();
        } else {
          await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(0);
          await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(0);
        }
        await page.reload();
        await expect(temp).toHaveAttribute("data-kind", quality === "ok" ? source : "invalid");
        await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(
          quality === "ok" ? 1 : 0,
        );
        expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
        expect(fingerprint(await witnessRows(f))).toBe(fingerprint(otherBefore));
      } finally {
        await page.close();
        await f.cleanup();
      }
    });
  }
}

for (const projection of ["event", "diary"] as const) {
  for (const transition of ["future-recovery", "manual-aging"] as const) {
    test(`Quick Log ${projection} ${transition} reprojects without refetch or writes and survives reopening`, async ({
      page,
      context,
    }) => {
      const f = await createLocalFixture();
      try {
        await fenceBrowser(context, f.env);
        await signIn(page, f);
        const wallNow = Date.now();
        const capturedAt = new Date(
          wallNow - (transition === "future-recovery" ? 1 : 1436) * 60_000,
        ).toISOString();
        // Keep the actual write within the database's timestamp fence; only the
        // browser clock is slow in the future-recovery scenario.
        const now =
          transition === "future-recovery" ? Date.parse(capturedAt) - 10 * 60_000 : wallNow;
        const manualSnapshot = { source: "manual", temp_f: 77, humidity_percent: 55 };
        const saved = await f.owner.client.rpc("quicklog_save_manual", {
          p_target_type: "plant",
          p_target_id: f.primary.plantId,
          p_action: "note",
          p_note: "Native local Quick Log manual clock proof",
          p_occurred_at: capturedAt,
          p_idempotency_key: randomUUID(),
          ...(projection === "event"
            ? { p_temperature_c: 25, p_humidity_pct: 55 }
            : { p_details: { manual_sensor_snapshot: manualSnapshot } }),
        });
        if (saved.error) throw new Error("Local Quick Log manual clock save failed");
        const receipt = acceptedReceipt(saved.data);
        const before = await ownerRows(f.owner);
        const otherBefore = await witnessRows(f);
        // Each case exercises only its intended manual projection. A matching
        // sensor_readings row or the other projection cannot rescue the UI.
        expect(before.sensor_readings).toHaveLength(0);
        const events = before.grow_events.filter((row) => row.event_type === "environment");
        expect(events).toHaveLength(projection === "event" ? 1 : 0);
        expect(before.environment_events).toHaveLength(projection === "event" ? 1 : 0);
        expect(before.diary_entries).toHaveLength(1);
        expect(
          before.grow_events.some(
            (row) => row.id === receipt.grow_event_id && row.source === "manual",
          ),
        ).toBe(true);
        for (const row of [...before.grow_events, ...before.diary_entries]) {
          expect(row).toMatchObject({
            user_id: f.owner.id,
            grow_id: f.primary.growId,
            tent_id: f.primary.tentId,
            plant_id: f.primary.plantId,
          });
          expect(Date.parse(String(row.occurred_at ?? row.entry_at))).toBe(Date.parse(capturedAt));
        }
        if (projection === "event") {
          expect(events[0]).toMatchObject({ source: "manual", is_deleted: false });
          expect(before.environment_events[0]).toMatchObject({
            event_id: events[0].id,
            temperature_c: 25,
            humidity_pct: 55,
            vpd_kpa: null,
          });
          expect(before.diary_entries[0].details).not.toHaveProperty("manual_sensor_snapshot");
        } else {
          expect(before.diary_entries[0]).toMatchObject({
            retracted_at: null,
            details: { manual_sensor_snapshot: manualSnapshot },
          });
        }
        expect(
          await visibleEventIds(
            f.other,
            before.grow_events.map((row) => String(row.id)),
          ),
        ).toEqual([]);
        let projectionReads = 0;
        page.on("request", (request) => {
          if (
            [
              "/rest/v1/sensor_readings_effective",
              "/rest/v1/grow_events",
              "/rest/v1/diary_entries",
            ].includes(new URL(request.url()).pathname)
          )
            projectionReads++;
        });
        await page.clock.install({ time: new Date(now) });
        await page.goto(`${f.env.ui}/sensors?tentId=${f.primary.tentId}&tentIntent=required`);
        const temp = page.getByTestId("sensors-metric-state-temp");
        const vpd = page.getByTestId("sensors-metric-state-vpd");
        const future = transition === "future-recovery";
        await expect(temp).toHaveAttribute("data-kind", future ? "invalid" : "manual");
        await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(future ? 0 : 1);
        await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(future ? 0 : 1);
        const readsBeforeClock = projectionReads;
        expect(readsBeforeClock).toBeGreaterThan(0);
        await page.clock.fastForward(future ? 6 * 60_000 + 1000 : 5 * 60_000);
        await expect(temp).toHaveAttribute("data-kind", future ? "manual" : "stale");
        await expect(vpd).toHaveAttribute("data-kind", future ? "derived" : "stale");
        await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(future ? 1 : 0);
        await expect(page.getByTestId("sensors-vpd-derived-value")).toBeVisible();
        expect(projectionReads).toBe(readsBeforeClock);
        expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
        await page.reload();
        await expect(temp).toHaveAttribute("data-kind", future ? "manual" : "stale");
        await expect(vpd).toHaveAttribute("data-kind", future ? "derived" : "no_reading_yet");
        await expect(page.getByTestId("sensors-stage-status-temp")).toHaveCount(future ? 1 : 0);
        await expect(page.getByTestId("sensors-vpd-derived-value")).toHaveCount(future ? 1 : 0);
        expect(fingerprint(await ownerRows(f.owner))).toBe(fingerprint(before));
        expect(fingerprint(await witnessRows(f))).toBe(fingerprint(otherBefore));
      } finally {
        await page.close();
        await f.cleanup();
      }
    });
  }
}
