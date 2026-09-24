import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createLocalFixture,
  fenceBrowser,
  fingerprint,
  localEnvironment,
  ownerRows,
  signIn,
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
