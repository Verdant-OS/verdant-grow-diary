import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { validateTarget } from './common.mjs';
import { spawnOwned, terminateOwned } from './process.mjs';

function targets(endpoint) {
  return new Promise((resolve, reject) => {
    // Local CDP discovery only. No direct external HTTP requests are made by the kit.
    const request = get(`${endpoint}/json/list`, { timeout: 2000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) request.destroy(); });
      response.on('error', reject);
      response.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid CDP listing.')); } });
    });
    request.on('timeout', () => request.destroy(new Error('CDP discovery timed out.')));
    request.on('error', reject);
  });
}

export async function openBrowser({ command = 'chromium', url, noSandbox = false, signal }) {
  validateTarget(url);
  signal?.throwIfAborted();
  let proxyOrigin;
  const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (proxy) {
    let parsed;
    try { parsed = new URL(proxy); } catch { throw new Error('Browser proxy address is invalid.'); }
    if (parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Browser proxy requires a credential-free HTTP(S) proxy address.');
    }
    proxyOrigin = parsed.origin;
  }
  const profile = await mkdtemp(join(tmpdir(), 'verdant-rea-browser-'));
  const args = ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-sync'];
  if (noSandbox) args.push('--no-sandbox');
  if (proxyOrigin) args.push(`--proxy-server=${proxyOrigin}`);
  args.push(url);
  const child = spawnOwned(command, args, { stdio: 'ignore' });
  let startFailed = false;
  child.on('error', () => { startFailed = true; });
  let closing;
  const close = () => closing ??= (async () => {
    await terminateOwned(child);
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  })();
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (startFailed || child.exitCode !== null) throw new Error('Chromium could not start; check --chrome PATH and sandbox support.');
      try {
        const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        if (/^\d+$/.test(port)) {
          const endpoint = `http://127.0.0.1:${port}`;
          const listing = await targets(endpoint);
          const target = listing.find(item => item.type === 'page' && item.url === url);
          if (target) return { endpoint, targetId: target.id, close };
        }
      } catch { /* Browser and the initial page may still be starting. */ }
      await delay(100);
    }
    throw new Error('Chromium did not expose the production landing page within 20 seconds.');
  } catch (error) { await close(); throw error; }
}
