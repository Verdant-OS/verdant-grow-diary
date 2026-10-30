#!/usr/bin/env node
import { mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { TARGET, metadata, isoDirectory, assertSafeEvidence, redact } from "./common.mjs";
import { readSourceInventory } from "./source.mjs";
import { checkRea, ReaSession } from "./mcp.mjs";
import { openBrowser } from "./browser.mjs";
import { buildBundleMap, renderReport } from "./report.mjs";

const HELP = `Usage: node scripts/rea/bundle-map.mjs --commit <40-character SHA> [options]

Job 3: passive signed-out capture of https://verdantgrowdiary.com/.
  --rea PATH        Global REA 6.8.0 executable (default: rea)
  --chrome PATH     Chromium executable (default: chromium)
  --no-sandbox      Explicit opt-in for containers without Chromium sandbox support
  --help            Print usage without starting a browser or REA

Writes report.md, inventory.json and canonical evidence-bundle.json under
rea-out/bundle-map/<ISO-timestamp>/. Application coverage and deployment SHA
attribution remain NOT_MEASURED. No login, source-map fetch or endpoint probing.
`;

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      commit: { type: "string" },
      rea: { type: "string", default: "rea" },
      chrome: { type: "string", default: "chromium" },
      "no-sandbox": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const source = readSourceInventory(repo, values.commit);
  const reaVersion = checkRea(values.rea);
  let browser,
    session,
    output,
    failure,
    summary,
    ownsOutput = false;
  const signals = ["SIGINT", "SIGTERM"];
  const controller = new AbortController();
  const interrupted = () => {
    controller.abort();
    void session?.close().catch(() => {});
  };
  const checkInterrupted = () => {
    if (controller.signal.aborted) throw new Error("Interrupted; capture discarded.");
  };
  for (const signal of signals) process.on(signal, interrupted);
  try {
    browser = await openBrowser({
      command: values.chrome,
      url: TARGET,
      noSandbox: values["no-sandbox"],
      signal: controller.signal,
    });
    checkInterrupted();
    const meta = metadata({ url: TARGET, commit: values.commit, reaVersion });
    output = join(repo, "rea-out", "bundle-map", isoDirectory(new Date(meta.captured_at_utc)));
    session = new ReaSession({
      command: values.rea,
      exportPath: join(output, "evidence-bundle.json"),
    });
    await session.start();
    checkInterrupted();
    const parameters = {
      cdp_endpoint: browser.endpoint,
      target_id: browser.targetId,
      allowed_origins: [new URL(TARGET).origin],
      observation_ms: 3000,
      include_accessibility_text: false,
      include_console_text: false,
      include_json_body_shapes: false,
      include_websocket_shapes: false,
      include_storage_keys: false,
      include_storage_fingerprints: false,
    };
    const page = await session.tool("inspect_web_page", {
      ...parameters,
      include_script_sources: false,
    });
    checkInterrupted();
    assertSafeEvidence(page);
    const bundle = await session.tool("analyze_web_bundle", {
      ...parameters,
      include_script_sources: true,
      fetch_source_maps: false,
      detail: "complete",
      analysis_timeout_ms: 120000,
      total_analysis_timeout_ms: 300000,
    });
    assertSafeEvidence(bundle);
    checkInterrupted();
    if (bundle.normalized_result?.capture?.target_url !== TARGET)
      throw new Error("Capture target changed; no evidence exported.");
    const map = buildBundleMap(source, bundle, page);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await mkdir(output, { mode: 0o700 });
    ownsOutput = true;
    checkInterrupted();
    const exported = await session.tool("export_evidence_bundle", {
      path: session.options.exportPath,
      overwrite: false,
    });
    if (exported.result?.records !== 2)
      throw new Error("Unexpected exported session records; discard output.");
    checkInterrupted();
    await chmod(session.options.exportPath, 0o600);
    await writeFile(
      join(output, "inventory.json"),
      JSON.stringify({ metadata: meta, ...map }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(join(output, "report.md"), renderReport(meta, map), {
      flag: "wx",
      mode: 0o600,
    });
    checkInterrupted();
    summary = `Report: ${join(output, "report.md")}\nObserved route candidates: ${map.observed_route_candidate_count}\nApplication route coverage: NOT_MEASURED\n`;
  } catch (error) {
    failure = error;
  } finally {
    try {
      await session?.close();
    } catch (error) {
      failure ??= error;
    }
    try {
      await browser?.close();
    } catch (error) {
      failure ??= error;
    }
    try {
      if (controller.signal.aborted) failure = new Error("Interrupted; capture discarded.");
      if (failure && ownsOutput) await rm(output, { recursive: true, force: true });
    } finally {
      for (const signal of signals) process.removeListener(signal, interrupted);
    }
  }
  if (failure) throw failure;
  process.stdout.write(summary);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`REA bundle map failed: ${redact(error.message).slice(0, 500)}\n`);
    process.exitCode = 1;
  });
}
