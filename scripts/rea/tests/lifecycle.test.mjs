import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnOwned, terminateOwned } from '../process.mjs';

test('owned process cleanup kills descendants before an ephemeral profile is removed', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rea-lifecycle-'));
  const marker = join(dir, 'marker');
  const helper = `const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>{try{fs.mkdirSync(${JSON.stringify(dir)},{recursive:true});fs.writeFileSync(${JSON.stringify(marker)},'alive')}catch{}},10)`;
  const script = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(helper)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const child = spawnOwned(process.execPath, ['-e', script], { stdio: 'ignore' });
  try {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) { try { await access(marker); break; } catch { await delay(20); } }
    assert.equal(await readFile(marker, 'utf8'), 'alive');
    await terminateOwned(child);
    await rm(dir, { recursive: true, force: true });
    await delay(100);
    await assert.rejects(access(marker));
  } finally { await terminateOwned(child); await rm(dir, { recursive: true, force: true }); }
});

test('CLI refuses missing commit and REA with specific diagnostics and no credential echo', () => {
  const missingCommit = spawnSync(process.execPath, ['scripts/rea/bundle-map.mjs'], { encoding: 'utf8' });
  assert.equal(missingCommit.status, 1);
  assert.match(missingCommit.stderr, /40-character SHA/);
  const missingRea = spawnSync(process.execPath, ['scripts/rea/bundle-map.mjs', '--commit',
    '0792349d57de2c1c0e2610f643920cf595486dfc', '--rea', '/nonexistent-rea-fixture'], { encoding: 'utf8' });
  assert.equal(missingRea.status, 1);
  assert.match(missingRea.stderr, /REA unavailable/);
  assert.ok(!missingRea.stderr.includes('/nonexistent-rea-fixture'));
});
