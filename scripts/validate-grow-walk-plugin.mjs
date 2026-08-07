#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins", "verdant-grow-walk");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`missing file: ${relative(repoRoot, path)}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function readJson(path) {
  const text = read(path);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON: ${relative(repoRoot, path)} (${error.message})`);
    return null;
  }
}

function assertRelativeInsidePlugin(value, label) {
  if (typeof value !== "string" || !value.startsWith("./")) {
    fail(`${label} must be a ./-prefixed relative path`);
    return;
  }
  const resolved = normalize(resolve(pluginRoot, value));
  if (resolved !== pluginRoot && !resolved.startsWith(`${pluginRoot}/`)) {
    fail(`${label} escapes the plugin root`);
  }
}

const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
const manifest = readJson(manifestPath);
if (manifest) {
  if (manifest.name !== "verdant-grow-walk") fail("plugin name must be verdant-grow-walk");
  if (manifest.version !== "0.1.0") fail("plugin version must be 0.1.0");
  if (typeof manifest.description !== "string" || manifest.description.length < 20) {
    fail("plugin description is missing or too short");
  }
  assertRelativeInsidePlugin(manifest.skills, "manifest.skills");
  if (Object.hasOwn(manifest, "apps")) fail("manifest must not include apps before real registration");
  if (Object.hasOwn(manifest, "mcpServers")) {
    fail("V0 uses the registered remote dependency, not a bundled MCP server");
  }
  if (manifest.interface?.displayName !== "Verdant Grow Walk") {
    fail("interface.displayName must be Verdant Grow Walk");
  }
  if (!Array.isArray(manifest.interface?.capabilities) || manifest.interface.capabilities.join(",") !== "Read") {
    fail("plugin capability must be Read only");
  }
  for (const key of ["composerIcon", "logo", "screenshots"]) {
    const value = manifest.interface?.[key];
    if (typeof value === "string") assertRelativeInsidePlugin(value, `interface.${key}`);
    if (Array.isArray(value)) value.forEach((item, index) => assertRelativeInsidePlugin(item, `interface.${key}[${index}]`));
  }
}

if (existsSync(join(pluginRoot, ".app.json"))) {
  fail(".app.json must not exist before a real plugin_asdk_app registration id is available");
}

const dependency = read(join(pluginRoot, "agents", "openai.yaml"));
for (const fragment of [
  'type: "mcp"',
  'value: "verdant-grow-os-mcp"',
  'transport: "streamable_http"',
  'url: "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp"',
]) {
  if (!dependency.includes(fragment)) fail(`agents/openai.yaml missing ${fragment}`);
}
if (/token|secret|authorization|service_role|plugin_asdk_app/i.test(dependency)) {
  fail("agents/openai.yaml contains a forbidden secret or placeholder token");
}

const skillPath = join(pluginRoot, "skills", "run-grow-walk", "SKILL.md");
const skill = read(skillPath);
if (!/^---\nname: run-grow-walk\ndescription: .+\n---\n/m.test(skill)) {
  fail("SKILL.md must start with name and description frontmatter");
}
for (const tool of ["list_grows", "list_grow_walk_targets", "get_grow_walk_context"]) {
  if (!skill.includes(`\`${tool}\``)) fail(`SKILL.md does not reference ${tool}`);
}
for (const boundary of [
  "Never save Quick Log",
  "Never claim a photo was inspected",
  "Never present manual, CSV, demo, stale, invalid, suspicious, or unknown telemetry as current live evidence",
  "Give no more than three physical checks",
]) {
  if (!skill.includes(boundary)) fail(`SKILL.md missing boundary: ${boundary}`);
}

for (const name of [
  "grow-walk-output-contract.md",
  "veteran-inspection-rules.md",
  "sensor-trust-policy.md",
  "safety-and-escalation-rules.md",
]) {
  read(join(pluginRoot, "skills", "run-grow-walk", "references", name));
}

const trigger = read(join(pluginRoot, "evals", "trigger-cases.yaml"));
const positiveBlock = trigger.match(/positive:\n([\s\S]*?)\nnegative:/)?.[1] ?? "";
const negativeBlock = trigger.match(/negative:\n([\s\S]*?)\nrouting:/)?.[1] ?? "";
const routingBlock = trigger.match(/routing:\n([\s\S]*)$/)?.[1] ?? "";
const countPrompts = (text) => (text.match(/^  - prompt:/gm) ?? []).length;
if (countPrompts(positiveBlock) < 20) fail("trigger evals require at least 20 positive cases");
if (countPrompts(negativeBlock) < 20) fail("trigger evals require at least 20 negative cases");
if (countPrompts(routingBlock) < 10) fail("trigger evals require at least 10 routing cases");

const safety = read(join(pluginRoot, "evals", "safety-cases.yaml"));
if ((safety.match(/^  - name:/gm) ?? []).length < 12) {
  fail("safety evals require at least 12 cases");
}
const toolContracts = read(join(pluginRoot, "evals", "tool-contract-cases.yaml"));
for (const tool of ["list_grows:", "list_grow_walk_targets:", "get_grow_walk_context:"]) {
  if (!toolContracts.includes(tool)) fail(`tool contract evals missing ${tool}`);
}

const marketplace = readJson(join(repoRoot, ".agents", "plugins", "marketplace.json"));
const entry = marketplace?.plugins?.find((candidate) => candidate.name === "verdant-grow-walk");
if (!entry) {
  fail("repo marketplace is missing verdant-grow-walk");
} else {
  if (entry.source?.source !== "local") fail("marketplace source must be local");
  if (entry.source?.path !== "./plugins/verdant-grow-walk") {
    fail("marketplace source.path must be ./plugins/verdant-grow-walk");
  }
  if (entry.policy?.installation !== "AVAILABLE") fail("marketplace installation must be AVAILABLE");
  if (entry.policy?.authentication !== "ON_INSTALL") fail("marketplace authentication must be ON_INSTALL");
  if (entry.category !== "Productivity") fail("marketplace category must be Productivity");
}

for (const path of [
  manifestPath,
  join(pluginRoot, "agents", "openai.yaml"),
  skillPath,
  join(repoRoot, ".agents", "plugins", "marketplace.json"),
]) {
  const text = read(path);
  if (/C:\\Users\\|\/Users\/|\/home\/[^/]+\/|plugin_asdk_app(?:_|\b)|\bTBD\b|\bTODO\b/i.test(text)) {
    fail(`${relative(repoRoot, path)} contains an absolute user path or unresolved placeholder`);
  }
}

if (failures.length > 0) {
  console.error("Grow Walk plugin validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Grow Walk plugin package valid: 1 skill, 4 references, 3 eval files, repo marketplace wired, no app placeholder.");
