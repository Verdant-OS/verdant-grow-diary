import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { REA_VERSION } from './common.mjs';
import { spawnOwned, terminateOwned } from './process.mjs';

const TOOLS = new Set(['inspect_web_page', 'analyze_web_bundle', 'export_evidence_bundle']);
const PRIVATE_OPTIONS = ['include_accessibility_text', 'include_console_text', 'include_json_body_shapes',
  'include_websocket_shapes', 'include_storage_keys', 'include_storage_fingerprints'];

export function checkRea(command) {
  let version;
  try { version = JSON.parse(execFileSync(command, ['--version', '--format', 'json'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'],
  })); } catch { throw new Error('REA unavailable: install global rea-agents@6.8.0 with its supported Node runtime, or pass --rea PATH.'); }
  if (version.version !== REA_VERSION || version.supported_runtime?.satisfied !== true) {
    throw new Error('REA 6.8.0 with a supported Node runtime is required.');
  }
  return version.version;
}

export class ReaSession {
  constructor({ command = 'rea', args = ['--mcp'], exportPath, timeoutMs = 420000 }) {
    this.options = { command, args, exportPath, timeoutMs };
    this.pending = new Map(); this.nextId = 1; this.buffer = ''; this.available = new Set();
  }

  async start() {
    this.child = spawnOwned(this.options.command, this.options.args, { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child.on('error', () => this.fail('REA process could not start.'));
    this.child.on('exit', () => this.fail('REA process exited before completing the request.'));
    this.child.stdin.on('error', () => this.fail('REA input stream closed.'));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      if (this.buffer.length > 64 * 1024 * 1024) { this.fail('REA response exceeded the memory budget.'); this.child.kill(); return; }
      let split;
      while ((split = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, split); this.buffer = this.buffer.slice(split + 1);
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); }
        catch { this.fail('REA emitted an invalid protocol response.'); this.child.kill(); return; }
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error('REA rejected a protocol request; raw diagnostics withheld.'));
        else pending.resolve(message.result);
      }
    });
    const init = await this.request('initialize', { protocolVersion: '2025-11-25',
      capabilities: {}, clientInfo: { name: 'verdant-rea-evidence-kit', version: '1.0.0' } });
    if (init.serverInfo?.version !== REA_VERSION) throw new Error('Unexpected REA MCP server version.');
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    let cursor;
    const seen = new Set();
    do {
      const page = await this.request('tools/list', cursor ? { cursor } : {});
      for (const tool of page.tools ?? []) this.available.add(tool.name);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('REA tool discovery repeated a cursor.');
      seen.add(cursor);
    } while (cursor);
    if ([...TOOLS].some(name => !this.available.has(name))) throw new Error('REA lacks required web/evidence tools.');
  }

  request(method, params) {
    if (this.stopped) return Promise.reject(new Error('REA session is closed.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error('REA request timed out; no capture exported.'));
      }, this.options.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async tool(name, parameters) {
    if (!TOOLS.has(name)) throw new Error('REA tool is outside the evidence-kit allowlist.');
    if (name === 'export_evidence_bundle') {
      if (!isAbsolute(parameters.path ?? '') || parameters.path !== this.options.exportPath || parameters.overwrite === true) {
        throw new Error('Export must use the owned, new evidence-bundle path.');
      }
    } else {
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(parameters.cdp_endpoint ?? '')) throw new Error('CDP must use literal loopback.');
      if (JSON.stringify(parameters.allowed_origins) !== '["https://verdantgrowdiary.com"]') throw new Error('Only the production origin is allowed.');
      if (PRIVATE_OPTIONS.some(key => parameters[key] !== false) ||
        (name === 'inspect_web_page' && parameters.include_script_sources !== false)) throw new Error('Privacy options must stay disabled.');
      if (name === 'analyze_web_bundle' && parameters.fetch_source_maps !== false) throw new Error('Source-map fetching must stay disabled.');
    }
    const response = await this.request('tools/call', { name, arguments: parameters });
    if (response?.isError) throw new Error('REA tool failed; discard this session without exporting.');
    if (response?.structuredContent) return response.structuredContent;
    try { return JSON.parse(response.content.find(item => item.type === 'text').text); }
    catch { throw new Error('REA returned unsupported evidence.'); }
  }

  fail(message) {
    this.stopped = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }

  close() {
    this.fail('REA session closed.');
    return this.closing ??= terminateOwned(this.child);
  }
}
