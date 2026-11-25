import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";
import {
  EcowittVegetationAlphaForward,
  EcowittVegetationAlphaForwardError,
} from "@/lib/ecowittVegetationAlphaForwardRules";

const SECRET = "a".repeat(32);
const ROOT = path.resolve(import.meta.dirname, "../..");
const WHERE = `WHERE id = '${EcowittVegetationAlphaForward.targetTentId}'::uuid`;

async function configFor(air: string, soil: string, passkey = SECRET) {
  const normalized = EcowittVegetationAlphaForward.acceptedPasskey(passkey);
  const passkeyFingerprint = await computeEcoWittPasskeyFingerprint(normalized);
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

  it("requires a 32-hex passkey and lowercases it before the fingerprint", async () => {
    expect(() => EcowittVegetationAlphaForward.acceptedPasskey("not-hex")).toThrow(
      /Passkey rejected/,
    );
    expect(() => EcowittVegetationAlphaForward.acceptedPasskey("ab")).toThrow(/Passkey rejected/);
    expect(EcowittVegetationAlphaForward.acceptedPasskey(SECRET)).toBe(SECRET.toLowerCase());
    const upper = await configFor("5", "1", SECRET);
    const lower = await configFor("5", "1", SECRET.toLowerCase());
    expect(upper.passkeyFingerprint).toBe(lower.passkeyFingerprint);
  });

  it("scopes SQL to a live WHERE clause and omits the raw passkey", async () => {
    const config = await configFor("3,1", "8");
    expect(config.tentId).toBe("78f51773-c576-4891-a9aa-240ed532337a");
    expect(config.airChannels).toEqual([1, 3]);
    expect(config.soilChannels).toEqual([8]);
    const sql = EcowittVegetationAlphaForward.renderScopedUpdateSql(config);
    const liveLines = sql.split("\n").filter((line) => !line.trim().startsWith("--"));
    expect(liveLines.filter((line) => line === WHERE)).toEqual([WHERE]);
    expect(sql).not.toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
    expect(sql).toContain(`'${config.passkeyFingerprint}'`);
    const text = EcowittVegetationAlphaForward.publicText(config, sql);
    expect(text.includes(SECRET)).toBe(false);
    expect(text.includes(SECRET.toLowerCase())).toBe(false);
    expect(() => EcowittVegetationAlphaForward.assertSecretAbsent(text, SECRET)).not.toThrow();
    expect(() =>
      EcowittVegetationAlphaForward.assertSecretAbsent(`${text} ${SECRET}`, SECRET),
    ).toThrow(/raw passkey/);
  });

  it("re-checks the fingerprint when rendering SQL", async () => {
    const config = await configFor("5", "1");
    expect(() =>
      EcowittVegetationAlphaForward.renderScopedUpdateSql({
        ...config,
        passkeyFingerprint: SECRET,
      }),
    ).toThrow(/ewfp_/);
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
    const merged = { ...process.env, ...env };
    if (!Object.prototype.hasOwnProperty.call(env, "ECOWITT_PASSKEY")) {
      delete merged.ECOWITT_PASSKEY;
    }
    return spawnSync("bun", [script, ...args], {
      cwd: ROOT,
      env: merged,
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

  it("rejects --passkey and keeps the secret out of stdout and stderr", () => {
    const result = run(["--passkey", SECRET, "--air", "5", "--soil", "1"], {
      ECOWITT_PASSKEY: "",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/must not be passed as --passkey/);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET.toLowerCase());
  });

  it("reads the passkey from stdin when ECOWITT_PASSKEY is unset", () => {
    const result = run(["--air", "5", "--soil", "1"], {}, `${SECRET}\n`);
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET.toLowerCase());
    const printed = JSON.parse(result.stdout) as { passkey_fingerprint: string; sql: string };
    expect(printed.passkey_fingerprint).toMatch(/^ewfp_[0-9a-f]{24}$/);
    expect(printed.sql.split("\n").filter((line) => line === WHERE)).toEqual([WHERE]);
  });

  it("redacts the passkey on the error path", () => {
    const result = run(["--air", "5"], { ECOWITT_PASSKEY: "not-a-passkey" });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Refusing to emit the raw passkey/);
    expect(`${result.stdout}${result.stderr}`).not.toContain("not-a-passkey");
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
    expect(printed.sql.split("\n").filter((line) => line === WHERE)).toEqual([WHERE]);
    expect(printed.sql).not.toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
  });
});

describe("vegetation alpha forward runbook", () => {
  const runbook = readFileSync(
    path.join(ROOT, "docs/runbooks/ecowitt-vegetation-alpha-78f51773-forward.md"),
    "utf8",
  );

  it("keys on the UUID and records the 2026-11-24 channels", () => {
    expect(runbook).toContain(EcowittVegetationAlphaForward.targetTentId);
    expect(runbook).toContain("WS View");
    expect(runbook).toContain("#3093");
    expect(runbook).toContain("--air 5");
    expect(runbook).toContain("--soil 1");
    expect(runbook).not.toMatch(/air_channels"\s*:\s*\[/);
    expect(runbook).toContain("claim token");
    expect(runbook).toContain("ew/<claim token>");
    expect(runbook).toContain("<PUBLIC_INGEST_HOST>");
    expect(runbook).toContain(EcowittVegetationAlphaForward.retiredFlowerTentId);
    expect(runbook).not.toContain("Do not pass `--soil 1`");
    expect(runbook).not.toContain("do not write `soil_channels`");
  });
});
