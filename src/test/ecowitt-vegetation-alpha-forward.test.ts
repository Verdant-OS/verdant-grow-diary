import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";
import {
  EcowittVegetationAlphaForward,
  EcowittVegetationAlphaForwardError,
} from "@/lib/ecowittVegetationAlphaForwardRules";

const SECRET = "gw-passkey-DO-NOT-PRINT-78f51773";
const ROOT = path.resolve(import.meta.dirname, "../..");

async function configFor(air: string, soil: string) {
  const passkeyFingerprint = await computeEcoWittPasskeyFingerprint(SECRET);
  expect(passkeyFingerprint).toMatch(/^ewfp_[0-9a-f]{24}$/);
  return EcowittVegetationAlphaForward.buildConfig({
    air,
    soil,
    passkeyFingerprint: passkeyFingerprint!,
  });
}

describe("EcowittVegetationAlphaForward", () => {
  it("rejects missing and out-of-range channels", () => {
    expect(() => EcowittVegetationAlphaForward.parseChannelList(undefined, "air_channels")).toThrow(
      EcowittVegetationAlphaForwardError,
    );
    expect(() => EcowittVegetationAlphaForward.parseChannelList("  ", "soil_channels")).toThrow(
      /required/,
    );
    expect(() => EcowittVegetationAlphaForward.parseChannelList("0", "air_channels")).toThrow(
      /1 to 8/,
    );
    expect(() => EcowittVegetationAlphaForward.parseChannelList("9", "soil_channels")).toThrow(
      /1 to 8/,
    );
    expect(() => EcowittVegetationAlphaForward.parseChannelList("1.5", "air_channels")).toThrow(
      /1 to 8/,
    );
    expect(() => EcowittVegetationAlphaForward.parseChannelList("2,9", "soil_channels")).toThrow(
      /1 to 8/,
    );
  });

  it("scopes SQL to the tent id and omits the raw passkey", async () => {
    const config = await configFor("3,1", "8");
    expect(config.tentId).toBe("78f51773-c576-4891-a9aa-240ed532337a");
    expect(config.airChannels).toEqual([1, 3]);
    expect(config.soilChannels).toEqual([8]);
    const sql = EcowittVegetationAlphaForward.renderScopedUpdateSql(config);
    expect(sql).toContain(`'${config.tentId}'`);
    expect(sql).not.toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
    expect(sql).toContain(`'${config.passkeyFingerprint}'`);
    const text = EcowittVegetationAlphaForward.publicText(config, sql);
    expect(text.includes(SECRET)).toBe(false);
    expect(() => EcowittVegetationAlphaForward.assertSecretAbsent(text, SECRET)).not.toThrow();
    expect(() =>
      EcowittVegetationAlphaForward.assertSecretAbsent(`${text} ${SECRET}`, SECRET),
    ).toThrow(/raw passkey/);
  });

  it("refuses a fingerprint that is not ewfp_ plus 24 hex", () => {
    expect(() =>
      EcowittVegetationAlphaForward.buildConfig({
        air: "1",
        soil: "1",
        passkeyFingerprint: SECRET,
      }),
    ).toThrow(/ewfp_/);
  });
});

describe("prepare-ecowitt-vegetation-alpha-forward script", () => {
  const script = path.join(ROOT, "scripts/prepare-ecowitt-vegetation-alpha-forward.ts");

  function run(args: string[], env: NodeJS.ProcessEnv, input?: string) {
    return spawnSync("bun", [script, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      input,
      encoding: "utf8",
    });
  }

  it("exits without channel defaults and without printing the passkey", () => {
    const missing = run([], { ECOWITT_PASSKEY: SECRET });
    expect(missing.status).toBe(2);
    expect(`${missing.stdout}${missing.stderr}`).not.toContain(SECRET);
    expect(missing.stderr).toMatch(/air_channels is required/);

    const range = run(["--air", "0", "--soil", "2"], { ECOWITT_PASSKEY: SECRET });
    expect(range.status).toBe(2);
    expect(`${range.stdout}${range.stderr}`).not.toContain(SECRET);

    const noKey = run(["--air", "1", "--soil", "2"], { ECOWITT_PASSKEY: "" });
    expect(noKey.status).toBe(2);
    expect(noKey.stderr).toMatch(/Passkey is required/);
  });

  it("prints the fingerprint and tent-scoped SQL only", () => {
    const result = run(["--air", "4", "--soil", "6"], { ECOWITT_PASSKEY: SECRET });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(SECRET);
    expect(result.stderr).not.toContain(SECRET);
    const printed = JSON.parse(result.stdout) as {
      tent_id: string;
      passkey_fingerprint: string;
      sql: string;
    };
    expect(printed.tent_id).toBe(EcowittVegetationAlphaForward.targetTentId);
    expect(printed.passkey_fingerprint).toMatch(/^ewfp_[0-9a-f]{24}$/);
    expect(printed.sql).toContain(printed.tent_id);
    expect(printed.sql).not.toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
  });
});

describe("vegetation alpha forward runbook", () => {
  const runbook = readFileSync(
    path.join(ROOT, "docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md"),
    "utf8",
  );

  it("keys on the UUID and keeps channels unconfirmed", () => {
    expect(runbook).toContain(EcowittVegetationAlphaForward.targetTentId);
    expect(runbook).toContain("Channels unconfirmed");
    expect(runbook).toContain("WS View");
    expect(runbook).not.toMatch(/air_channels"\s*:\s*\[/);
    expect(runbook).toContain("claim token");
    expect(runbook).toContain("ew/<claim token>");
    expect(runbook).toContain("<PUBLIC_INGEST_HOST>");
    expect(runbook).toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
  });
});
