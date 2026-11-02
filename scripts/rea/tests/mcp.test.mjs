import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReaSession } from "../mcp.mjs";

// External process double: exercises real JSON-lines framing and lifecycle without a capture.
const server = `
import readline from 'node:readline';
const names = ['inspect_web_page', 'analyze_web_bundle', 'export_evidence_bundle'];
for await (const line of readline.createInterface({input:process.stdin})) {
 const m=JSON.parse(line); if(m.id===undefined)continue;
 if(m.method==='tools/call' && m.params.arguments.observation_ms===99)continue;
 const result=m.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'6.8.0'}}:
 m.method==='tools/list'?{tools:names.map(name=>({name,inputSchema:{type:'object'}}))}:
 {structuredContent:{operation:m.params.name,raw_result:null,normalized_result:{fixture:true}}};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
}`;

async function withSession(run, timeoutMs = 2000) {
  const dir = await mkdtemp(join(tmpdir(), "rea-mcp-test-"));
  const path = join(dir, "server.mjs");
  await writeFile(path, server);
  const session = new ReaSession({
    command: process.execPath,
    args: [path],
    exportPath: join(dir, "evidence-bundle.json"),
    timeoutMs,
  });
  try {
    await session.start();
    await run(session);
  } finally {
    await session.close();
    await rm(dir, { recursive: true, force: true });
  }
}

const parameters = {
  cdp_endpoint: "http://127.0.0.1:9222",
  target_id: "fixture",
  allowed_origins: ["https://verdantgrowdiary.com"],
  include_script_sources: false,
  include_accessibility_text: false,
  include_console_text: false,
  include_json_body_shapes: false,
  include_websocket_shapes: false,
  include_storage_keys: false,
  include_storage_fingerprints: false,
};

test("MCP client initializes, discovers tools and decodes structured evidence", async () => {
  await withSession(async (session) => {
    const result = await session.tool("inspect_web_page", parameters);
    assert.equal(result.operation, "inspect_web_page");
    assert.equal(result.normalized_result.fixture, true);
  });
});

test("MCP boundary refuses unapproved tools, source maps, private data and non-owned exports", async () => {
  await withSession(async (session) => {
    await assert.rejects(session.tool("run_command", {}), /allowlist/i);
    await assert.rejects(
      session.tool("inspect_web_page", { ...parameters, include_script_sources: true }),
      /privacy/i,
    );
    await assert.rejects(
      session.tool("inspect_web_page", { ...parameters, cdp_endpoint: "https://example.com" }),
      /loopback/i,
    );
    await assert.rejects(
      session.tool("analyze_web_bundle", {
        ...parameters,
        include_script_sources: true,
        fetch_source_maps: true,
      }),
      /source.map/i,
    );
    await assert.rejects(
      session.tool("export_evidence_bundle", { path: "/tmp/unowned-output.json" }),
      /export/i,
    );
  });
});

test("unresponsive REA requests time out with a bounded diagnostic", async () => {
  await withSession(async (session) => {
    session.options.timeoutMs = 100;
    await assert.rejects(
      session.tool("inspect_web_page", { ...parameters, observation_ms: 99 }),
      /timed out/i,
    );
  }, 2000);
});
