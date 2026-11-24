/**
 * Print a reviewed, idempotent hardware_config update for tent
 * 78f51773-c576-4891-a9aa-240ed532337a. Does not connect to a database.
 *
 *   ECOWITT_PASSKEY=... bun scripts/prepare-ecowitt-vegetation-alpha-forward.ts --air 3 --soil 5
 *
 * The passkey may also be the sole line on stdin. It is never printed.
 */
import { computeEcoWittPasskeyFingerprint } from "../src/lib/ecowittPasskeyFingerprint";
import {
  EcowittVegetationAlphaForward,
  EcowittVegetationAlphaForwardError,
} from "../src/lib/ecowittVegetationAlphaForwardRules";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function readPasskey(): Promise<string> {
  const fromEnv = process.env.ECOWITT_PASSKEY;
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv.trim();
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main(): Promise<void> {
  const air = argValue("--air");
  const soil = argValue("--soil");
  let passkey = "";
  try {
    passkey = await readPasskey();
    if (passkey === "") {
      throw new EcowittVegetationAlphaForwardError(
        "Passkey is required via ECOWITT_PASSKEY or stdin.",
      );
    }
    const fingerprint = await computeEcoWittPasskeyFingerprint(passkey);
    if (fingerprint === null) {
      throw new EcowittVegetationAlphaForwardError("Passkey did not produce a fingerprint.");
    }
    const config = EcowittVegetationAlphaForward.buildConfig({
      air,
      soil,
      passkeyFingerprint: fingerprint,
    });
    const sql = EcowittVegetationAlphaForward.renderScopedUpdateSql(config);
    const text = EcowittVegetationAlphaForward.publicText(config, sql);
    EcowittVegetationAlphaForward.assertSecretAbsent(text, passkey);
    process.stdout.write(`${text}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "forward planner failed";
    if (passkey !== "") {
      EcowittVegetationAlphaForward.assertSecretAbsent(message, passkey);
    }
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}

await main();
