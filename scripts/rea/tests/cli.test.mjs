import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

async function waitFor(path) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { try { return await readFile(path, 'utf8'); } catch { await delay(20); } }
  throw new Error('Fixture did not reach the expected phase.');
}

async function fixture(mode, run) {
  const dir = await mkdtemp(join(tmpdir(), 'rea-cli-fixture-'));
  const chrome = join(dir, 'chrome.mjs'), rea = join(dir, 'rea.mjs');
  const profileFile = join(dir, 'profile'), phaseFile = join(dir, 'phase');
  const outputFile = join(dir, 'output');
  const browserPid = join(dir, 'browser-pid'), reaPid = join(dir, 'rea-pid');
  const browser = `#!/usr/bin/env node
import {writeFileSync} from 'node:fs';import {createServer} from 'node:http';
const profile=process.argv.find(v=>v.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
writeFileSync(${JSON.stringify(profileFile)},profile);
writeFileSync(${JSON.stringify(browserPid)},String(process.pid));
const server=createServer((q,s)=>s.end(JSON.stringify([{type:'page',url:'https://verdantgrowdiary.com/',id:'fixture'}])));
server.listen(0,'127.0.0.1',()=>{${mode === 'startup' ? 'setTimeout(()=>{},60000);' : `writeFileSync(profile+'/DevToolsActivePort',String(server.address().port)+'\\n');`}});
`;
  const tool = `#!/usr/bin/env node
import readline from 'node:readline';import {writeFileSync} from 'node:fs';
if(process.argv.includes('--version')){console.log(JSON.stringify({version:'6.8.0',supported_runtime:{satisfied:true}}));process.exit(0)}
writeFileSync(${JSON.stringify(reaPid)},String(process.pid));
if(${JSON.stringify(mode)}==='cleanup')process.on('SIGTERM',()=>writeFileSync(${JSON.stringify(phaseFile)},'closing'));
const records=[];const names=['inspect_web_page','analyze_web_bundle','export_evidence_bundle'];
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.id===undefined)continue;let result;
 if(m.method==='initialize')result={serverInfo:{version:'6.8.0'}};
 else if(m.method==='tools/list')result={tools:names.map(name=>({name}))};
 else if(m.params.name==='export_evidence_bundle'){
  writeFileSync(m.params.arguments.path,JSON.stringify({records}));writeFileSync(${JSON.stringify(outputFile)},m.params.arguments.path);
  if(${JSON.stringify(mode)}==='export'){writeFileSync(${JSON.stringify(phaseFile)},'pending');continue}
  result={structuredContent:{result:{records:2}}};
 }else{
  const analyze=m.params.name==='analyze_web_bundle';
  if(analyze && ${JSON.stringify(mode)}==='capture'){writeFileSync(${JSON.stringify(phaseFile)},'pending');continue}
  const normal=analyze?{capture:{target_url:'https://verdantgrowdiary.com/',scripts_observed:1,scripts_analyzed:1},completeness:{status:'complete'},route_inventory:{routes:[{path:'/fixture',classification:'unknown',confidence:'medium'}]},observations:{chunks:{nodes:[]}}}:{};
  if(${JSON.stringify(mode)}==='unsafe')normal.endpoint='/callback?token=synthetic-never-save';
  const record={operation:m.params.name,evidence_id:'ev_'+'a'.repeat(64),raw_result:null,normalized_result:normal};records.push(record);result={structuredContent:record};
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
}`;
  await writeFile(chrome, browser, { mode: 0o700 });
  await writeFile(rea, tool, { mode: 0o700 });
  const child = spawn(process.execPath, ['scripts/rea/bundle-map.mjs', '--commit',
    '0792349d57de2c1c0e2610f643920cf595486dfc', '--rea', rea, '--chrome', chrome], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const completed = new Promise(resolve => child.once('exit', code => resolve(code)));
  try { await run({ child, completed, profileFile, phaseFile, outputFile, result: () => ({ stdout, stderr }) }); }
  finally {
    if (child.exitCode === null && !child.signalCode) { child.kill('SIGTERM'); await completed; }
    for (const file of [browserPid, reaPid]) {
      try { process.kill(-Number(await readFile(file, 'utf8')), 'SIGKILL'); } catch { /* Owned fixture already exited. */ }
    }
    try { await rm(await readFile(profileFile, 'utf8'), { recursive: true, force: true }); } catch { /* No profile. */ }
    try { await rm(dirname(await readFile(outputFile, 'utf8')), { recursive: true, force: true }); } catch { /* No export. */ }
    await rm(dir, { recursive: true, force: true });
  }
}

test('CLI writes a measured report and actual session export, then removes its browser profile', async () => {
  await fixture('success', async ({ completed, profileFile, outputFile, result }) => {
    assert.equal(await completed, 0, result().stderr);
    const output = await readFile(outputFile, 'utf8');
    const inventory = JSON.parse(await readFile(join(dirname(output), 'inventory.json'), 'utf8'));
    assert.equal(inventory.observed_route_candidate_count, 1);
    assert.equal(inventory.unmatched_route_candidates[0].path, '/fixture');
    assert.equal(JSON.parse(await readFile(output, 'utf8')).records.length, 2);
    assert.match(await readFile(join(dirname(output), 'report.md'), 'utf8'), /Verified:/);
    await assert.rejects(access(await readFile(profileFile, 'utf8')));
  });
});

test('unsafe capture exits without exporting or echoing credentials', async () => {
  await fixture('unsafe', async ({ completed, outputFile, profileFile, result }) => {
    assert.equal(await completed, 1);
    await assert.rejects(access(outputFile));
    assert.ok(!JSON.stringify(result()).includes('synthetic-never-save'));
    await assert.rejects(access(await readFile(profileFile, 'utf8')));
  });
});

for (const phase of ['startup', 'capture', 'export', 'cleanup']) {
  test(`SIGTERM during ${phase} closes owned processes and removes incomplete output`, async () => {
    await fixture(phase, async ({ child, completed, profileFile, phaseFile, outputFile }) => {
      await waitFor(phase === 'startup' ? profileFile : phaseFile);
      child.kill('SIGTERM');
      assert.equal(await completed, 1);
      await assert.rejects(access(await readFile(profileFile, 'utf8')));
      if (phase === 'export' || phase === 'cleanup') await assert.rejects(access(dirname(await readFile(outputFile, 'utf8'))));
      else await assert.rejects(access(outputFile));
    });
  });
}
