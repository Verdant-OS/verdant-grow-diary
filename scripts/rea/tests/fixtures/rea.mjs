#!/usr/bin/env node
import readline from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.argv.includes("--version")) {
  console.log(JSON.stringify({ version: "6.8.0", supported_runtime: { satisfied: true } }));
  process.exit(0);
}
const dir = process.env.VERDANT_REA_FIXTURE_DIR;
if (!dir) throw new Error("Test fixture directory is required.");
const { mode } = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
writeFileSync(join(dir, "rea-pid"), String(process.pid));
if (mode === "cleanup") process.on("SIGTERM", () => writeFileSync(join(dir, "phase"), "closing"));
const records = [];
const names = ["inspect_web_page", "analyze_web_bundle", "export_evidence_bundle"];
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.id === undefined) continue;
  let result;
  if (message.method === "initialize") result = { serverInfo: { version: "6.8.0" } };
  else if (message.method === "tools/list") result = { tools: names.map((name) => ({ name })) };
  else if (message.params.name === "export_evidence_bundle") {
    writeFileSync(message.params.arguments.path, JSON.stringify({ records }));
    writeFileSync(join(dir, "output"), message.params.arguments.path);
    if (mode === "export") {
      writeFileSync(join(dir, "phase"), "pending");
      continue;
    }
    result = { structuredContent: { result: { records: mode === "rollback" ? 1 : 2 } } };
  } else {
    const analyze = message.params.name === "analyze_web_bundle";
    if (analyze && mode === "capture") {
      writeFileSync(join(dir, "phase"), "pending");
      continue;
    }
    const normalized_result = analyze
      ? {
          capture: {
            target_url: "https://verdantgrowdiary.com/",
            scripts_observed: 1,
            scripts_analyzed: 1,
          },
          completeness: { status: "complete" },
          route_inventory: {
            routes: [{ path: "/fixture", classification: "unknown", confidence: "medium" }],
          },
          observations: { chunks: { nodes: [] } },
        }
      : {};
    if (mode === "unsafe") normalized_result.endpoint = "/callback?token=synthetic-never-save";
    const record = {
      operation: message.params.name,
      evidence_id: `ev_${"a".repeat(64)}`,
      raw_result: null,
      normalized_result,
    };
    records.push(record);
    result = { structuredContent: record };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
}
