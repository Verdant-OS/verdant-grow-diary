import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertSafeEvidence, redact, metadata, validateTarget } from '../common.mjs';
import { readSourceInventory } from '../source.mjs';
import { buildBundleMap, renderReport } from '../report.mjs';

const sha = 'a'.repeat(40);
const url = 'https://verdantgrowdiary.com/';
const evidence = (normalized_result) => ({
  operation: 'analyze_web_bundle', evidence_id: `ev_${'b'.repeat(64)}`,
  raw_result: null, normalized_result,
});

test('saved projections redact credential fields, bearer strings, JWTs and URL parameters', () => {
  const secret = 'synthetic-fixture-secret';
  const value = redact({ password: secret, nested: [{ authorization: `Bearer ${secret}` }],
    url: `https://example.com/path?api_key=${secret}#${secret}`,
    message: `Bearer ${secret}`, jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.abcdefghijk',
    route: '/reset-password' });
  const saved = JSON.stringify(value);
  assert.ok(!saved.includes(secret));
  assert.ok(!saved.includes('eyJhbGci'));
  assert.equal(value.url, 'https://example.com/path');
  assert.equal(value.route, '/reset-password');
});

test('canonical exports are refused if evidence needs redaction or contains raw source', () => {
  assert.throws(() => assertSafeEvidence(evidence({ api_key: 'synthetic-fixture-secret' })), /unsafe/i);
  assert.throws(() => assertSafeEvidence({ ...evidence({}), raw_result: { source: 'code' } }), /raw/i);
  assert.throws(() => assertSafeEvidence(evidence({ url: 'https://example.com/?token=synthetic' })), /unsafe/i);
  assert.doesNotThrow(() => assertSafeEvidence(evidence({ token: '[REDACTED]', route: '/reset-password' })));
});

test('safe origin and loopback strings retain canonical bytes during export preflight', () => {
  assert.doesNotThrow(() => assertSafeEvidence(evidence({
    parameters: { allowed_origins: ['https://verdantgrowdiary.com'], cdp_endpoint: 'http://127.0.0.1:9222' },
  })));
});

test('canonical safety accepts benign campaign queries and rejects relative/WebSocket credentials', () => {
  assert.doesNotThrow(() => assertSafeEvidence(evidence({ url: 'https://example.com/?utm_source=public#features' })));
  for (const endpoint of ['/callback?token=synthetic', '//example.com/?api_key=synthetic',
    'wss://example.com/ws?access_token=synthetic', '?password=synthetic', '#token=synthetic',
    '/callback?redirect=%2Fnext%3Ftoken%3Dsynthetic']) {
    assert.throws(() => assertSafeEvidence(evidence({ endpoint })), /unsafe/i);
  }
  assert.throws(() => assertSafeEvidence(evidence({ headers: [{ name: 'Authorization', value: 'Basic synthetic' }] })), /unsafe/i);
});

test('job 3 accepts only the production landing page without credentials, query or fragment', () => {
  assert.equal(validateTarget(url), url);
  for (const target of ['http://verdantgrowdiary.com/', 'https://example.com/',
    'https://verdantgrowdiary.com/admin', 'https://user:pass@verdantgrowdiary.com/',
    `${url}?token=synthetic`, `${url}#fragment`]) {
    assert.throws(() => validateTarget(target));
  }
});

test('report metadata records exact reference SHA and daylight-correct Chicago time', () => {
  const summer = metadata({ url, commit: sha, reaVersion: '6.8.0', now: new Date('2026-07-01T12:00:00Z') });
  const winter = metadata({ url, commit: sha, reaVersion: '6.8.0', now: new Date('2026-12-01T12:00:00Z') });
  assert.equal(summer.reference_commit, sha);
  assert.match(summer.captured_at_ct, /CDT/);
  assert.match(winter.captured_at_ct, /CST/);
  assert.equal(summer.deployed_commit, 'NOT_MEASURED');
  assert.throws(() => metadata({ url, commit: 'abc', reaVersion: '6.8.0' }));
});

test('source inventory reads the named commit rather than uncommitted working files', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'rea-source-test-'));
  try {
    execFileSync('git', ['init', '-q', repo]);
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'src/routeTree.gen.ts'), "export interface FileRoutesByFullPath {\n '/': typeof Home\n '/grows/$growId': typeof Grow\n}\n");
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, '-c', 'user.name=REA Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
    const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    await writeFile(join(repo, 'src/routeTree.gen.ts'), 'uncommitted different source');
    const inventory = readSourceInventory(repo, commit);
    assert.deepEqual(inventory.routes, ['/', '/grows/$growId']);
    assert.deepEqual(inventory.modules, ['src/routeTree.gen.ts']);
    assert.match(inventory.route_manifest_sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => readSourceInventory(repo, '--help'));
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test('bundle comparison records captured candidates without asserting unshipped routes or source identities', () => {
  const result = buildBundleMap({ routes: ['/', '/lazy'], modules: ['src/page.tsx'] }, evidence({
    capture: { target_url: url, scripts_observed: 2, scripts_analyzed: 1 },
    completeness: { status: 'partial', parse_failures: 1 },
    route_inventory: { routes: [{ path: '/', classification: 'page', confidence: 'high' },
      { path: '/unexpected', classification: 'unknown', confidence: 'low' }],
      coverage: { application_routes: 'unknown' }, unknowns: [{ reason: 'dynamic path' }] },
    observations: { chunks: { nodes: [{ url: `${url}assets/home.js`, artifact_sha256: 'c'.repeat(64), bytes: 42 }] } },
    unknowns: ['timed out script'], limitations: ['captured scripts only'],
  }));
  assert.equal(result.observed_route_candidate_count, 2);
  assert.equal(result.source_routes[0].status, 'OBSERVED_CANDIDATE');
  assert.equal(result.source_routes[1].status, 'NOT_MEASURED');
  assert.deepEqual(result.unmatched_route_candidates.map(r => r.path), ['/unexpected']);
  assert.equal(result.source_module_mapping.status, 'NOT_MEASURED');
  assert.equal(result.application_route_coverage, 'NOT_MEASURED');
  assert.equal(result.analysis_completeness, 'NOT_MEASURED');
  assert.ok(result.unknowns.some(v => v.includes('dynamic path')));
  const report = renderReport(metadata({ url, commit: sha, reaVersion: '6.8.0' }), result);
  assert.match(report, /NOT_MEASURED.*dynamic path/);
  assert.match(report.trim().split('\n').at(-1), /^Verified:/);
  assert.ok(!report.includes('never shipped'));
});

test('zero candidates with missing route data stays unmeasured', () => {
  const result = buildBundleMap({ routes: ['/'], modules: [] }, evidence({}));
  assert.equal(result.observed_route_candidate_count, 'NOT_MEASURED');
  assert.equal(result.source_routes[0].status, 'NOT_MEASURED');
  assert.equal(result.chunks.status, 'NOT_MEASURED');
});

test('CLI help works without REA or application dependencies', () => {
  const run = spawnSync(process.execPath, ['scripts/rea/bundle-map.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /--commit/);
});
