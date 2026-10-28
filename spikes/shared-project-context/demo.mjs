import { ContextStore } from './context.mjs';
import { PROJECT_ID, NOW, HEAD_B, exactHead, fixtureJSON, headsJSON } from './fixtures.mjs';

const store = new ContextStore({ projectId: PROJECT_ID, initialJSON: fixtureJSON, readOnly: true });
const options = { now: NOW, headsJSON: headsJSON() };
const clients = ['simulated Codex client', 'simulated Claude client', 'simulated Grok client']
  .map((name) => ({ name, connection: 'none; local simulation only', data: store.read(exactHead.id, options) }));

console.log(JSON.stringify({
  mode: 'synthetic offline prototype', clients,
  afterSourceHeadChanged: store.read(exactHead.id, { now: NOW, headsJSON: headsJSON(HEAD_B) }),
  search: store.search('sample', { ...options, limit: 3 }),
  exportBytes: Buffer.byteLength(store.exportJSON(), 'utf8'),
}, null, 2));
