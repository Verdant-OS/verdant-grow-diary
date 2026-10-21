import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({
  jsonBytes: 65_536, records: 128, textChars: 2_048,
  referenceCount: 16, results: 20, queryChars: 128,
});
const FIELDS = ['projectId', 'text', 'kind', 'source', 'observedAt',
  'verification', 'expiresAt', 'supersedes', 'conflictsWith'];
const ID = /^sha256:[0-9a-f]{64}$/;
const PROJECT = /^[a-z][a-z0-9-]{0,47}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const fail = (message) => { throw new TypeError(message); };
const optional = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;

function object(value, fields, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Expected a plain object');
  const keys = Reflect.ownKeys(value);
  if (keys.length > fields.length + optional.length) fail('Unknown field');
  for (const key of keys) {
    if (typeof key !== 'string' || BAD_KEYS.has(key) || !fields.concat(optional).includes(key)) fail('Unknown field');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value')) fail('Accessors are not accepted');
  }
  for (const key of fields) if (!Object.hasOwn(value, key)) fail('Missing field');
  return value;
}

function parse(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > LIMITS.jsonBytes) fail('JSON input exceeds byte limit or is not a string');
  // A small explicit depth bound prevents deeply nested inputs reaching JSON.parse.
  let depth = 0, quoted = false, escaped = false;
  for (const char of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') { if (++depth > 12) fail('JSON nesting exceeds limit'); }
    else if (char === '}' || char === ']') depth--;
  }
  let value;
  try {
    value = JSON.parse(json, (key, entry) => {
      if (BAD_KEYS.has(key)) fail('Prototype keys are forbidden');
      return entry;
    });
  } catch { fail('Invalid JSON or forbidden key'); }
  return value;
}

function string(value, max, pattern) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max ||
      (pattern && !pattern.test(value))) fail('Invalid or oversized string');
  return value;
}
function project(value) { return string(value, 48, PROJECT); }
function timestamp(value) {
  string(value, 24, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail('Invalid timestamp');
  return ms;
}
function source(value) {
  object(value, ['type', 'location', 'commit']);
  string(value.location, 200);
  string(value.commit, 40, COMMIT);
  let path;
  if (value.type === 'fixture-uri') {
    if (!/^fixture:\/\/[a-z0-9-]+\/[a-zA-Z0-9._/-]+$/.test(value.location)) fail('Source URI is not an allowed fixture URI');
    path = value.location.slice('fixture://'.length);
  } else if (value.type === 'repo-path') {
    if (!/^(docs|src|fixtures)\/[a-zA-Z0-9._/-]+\.(md|txt|json|mjs|ts)$/.test(value.location)) fail('Source path is not allowlisted');
    path = value.location;
  } else fail('Unknown source type');
  if (path.split('/').some((part) => part === '.' || part === '..' || part === '')) fail('Traversal or empty source segment');
  return { type: value.type, location: value.location, commit: value.commit };
}
function references(value) {
  if (!Array.isArray(value) || value.length > LIMITS.referenceCount) fail('Reference list exceeds limit');
  for (const id of value) string(id, 71, ID);
  if (new Set(value).size !== value.length) fail('Duplicate reference');
  return [...value].sort();
}
function fields(value) {
  project(value.projectId);
  string(value.text, LIMITS.textChars);
  if (!value.text.trim()) fail('Empty factual text');
  if (!['fact', 'constraint', 'exact-head'].includes(value.kind)) fail('Unknown kind');
  const provenance = source(value.source);
  const observed = timestamp(value.observedAt);
  if (!['verified', 'unverified'].includes(value.verification)) fail('Unknown verification status');
  if (value.expiresAt !== null && timestamp(value.expiresAt) <= observed) fail('Expiry must follow observation');
  return {
    projectId: value.projectId, text: value.text, kind: value.kind, source: provenance,
    observedAt: value.observedAt, verification: value.verification, expiresAt: value.expiresAt,
    supersedes: references(value.supersedes), conflictsWith: references(value.conflictsWith),
  };
}
const recordId = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
/** Synthetic data constructor, not a verification service. */
export function createRecord(inputJSON) {
  const input = object(parse(inputJSON), FIELDS);
  const canonical = fields(input);
  return freeze({ id: recordId(canonical), ...canonical });
}
function record(value) {
  object(value, ['id', ...FIELDS]);
  string(value.id, 71, ID);
  const canonical = fields(value);
  if (value.id !== recordId(canonical)) fail('Record ID integrity mismatch');
  if (canonical.supersedes.includes(value.id) || canonical.conflictsWith.includes(value.id)) fail('Self reference');
  if (canonical.supersedes.some((id) => canonical.conflictsWith.includes(id))) fail('Conflicting relationship types');
  return freeze({ id: value.id, ...canonical });
}
const envelope = (projectId, records) => ({ version: 1, synthetic: true, projectId, records });
function serialize(projectId, records) {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const json = `${JSON.stringify(envelope(projectId, sorted), null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > LIMITS.jsonBytes) fail('Accumulated export exceeds byte limit');
  return json;
}
function graph(records) {
  for (const value of records.values()) {
    for (const id of [...value.supersedes, ...value.conflictsWith]) {
      if (!records.has(id)) fail('Dangling or cross-project reference');
    }
  }
  const active = new Set(), visited = new Set();
  function visit(id) {
    if (active.has(id)) fail('Supersession cycle');
    if (visited.has(id)) return;
    active.add(id);
    for (const previous of records.get(id).supersedes) visit(previous);
    active.delete(id);
    visited.add(id);
  }
  for (const id of records.keys()) visit(id);
}
function heads(json, projectId) {
  if (json === undefined) return new Map();
  const input = object(parse(json), ['projectId', 'heads']);
  if (project(input.projectId) !== projectId) fail('Wrong heads project');
  if (!Array.isArray(input.heads) || input.heads.length > LIMITS.records) fail('Heads exceed limit');
  const result = new Map();
  for (const entry of input.heads) {
    const current = source(entry);
    const key = `${current.type}:${current.location}`;
    if (result.has(key)) fail('Duplicate source head');
    result.set(key, current.commit);
  }
  return result;
}
function readOptions(options, projectId, search) {
  object(options, ['now'], search ? ['headsJSON', 'limit'] : ['headsJSON']);
  const now = timestamp(options.now);
  const currentHeads = heads(optional(options, 'headsJSON'), projectId);
  const requestedLimit = optional(options, 'limit');
  const limit = search && requestedLimit !== undefined ? requestedLimit : 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.results) fail('Result limit must be 1..20');
  return { now, currentHeads, limit };
}

/** No filesystem, process, environment, network, agent or execution capabilities. */
export class ContextStore {
  #projectId;
  #records = new Map();
  #readOnly;
  constructor(options) {
    object(options, ['projectId'], ['initialJSON', 'readOnly']);
    this.#projectId = project(options.projectId);
    const readOnly = optional(options, 'readOnly');
    const initialJSON = optional(options, 'initialJSON');
    if (readOnly !== undefined && typeof readOnly !== 'boolean') fail('readOnly must be boolean');
    this.#readOnly = false;
    if (initialJSON !== undefined) this.importJSON(initialJSON);
    this.#readOnly = readOnly ?? false;
    Object.freeze(this);
  }
  importJSON(json) {
    if (this.#readOnly) fail('Read-only store');
    const input = object(parse(json), ['version', 'synthetic', 'projectId', 'records']);
    if (input.version !== 1 || input.synthetic !== true) fail('Only version 1 synthetic fixtures are accepted');
    if (project(input.projectId) !== this.#projectId) fail('Wrong project');
    if (!Array.isArray(input.records) || input.records.length > LIMITS.records) fail('Record count exceeds limit');
    const next = new Map(this.#records), batch = new Set();
    for (const raw of input.records) {
      const value = record(raw);
      if (value.projectId !== this.#projectId) fail('Record belongs to another project');
      if (batch.has(value.id)) fail('Duplicate record in import');
      batch.add(value.id);
      const previous = next.get(value.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(value)) fail('Immutable ID collision');
      next.set(value.id, value);
    }
    if (next.size > LIMITS.records) fail('Accumulated record count exceeds limit');
    graph(next);
    serialize(this.#projectId, next.values());
    const added = next.size - this.#records.size;
    this.#records = next;
    return freeze({ added, total: next.size });
  }
  exportJSON() { return serialize(this.#projectId, this.#records.values()); }
  #view(value, { now, currentHeads }) {
    const reasons = [];
    if (Date.parse(value.observedAt) > now) reasons.push('future-observation');
    if (value.expiresAt !== null && now >= Date.parse(value.expiresAt)) reasons.push('expired');
    if (value.kind === 'exact-head') {
      const current = currentHeads.get(`${value.source.type}:${value.source.location}`);
      if (current === undefined) reasons.push('source-head-missing');
      else if (current !== value.source.commit) reasons.push('source-head-changed');
    }
    const supersededBy = [], conflictIds = new Set(value.conflictsWith);
    for (const candidate of this.#records.values()) {
      if (candidate.supersedes.includes(value.id)) supersededBy.push(candidate.id);
      if (candidate.conflictsWith.includes(value.id)) conflictIds.add(candidate.id);
    }
    const effectiveVerification = value.verification === 'verified' && reasons.length === 0 &&
      supersededBy.length === 0 && conflictIds.size === 0 ? 'verified' : 'unverified';
    return freeze({
      record: value, effectiveVerification,
      labels: ['synthetic', 'untrusted-data', effectiveVerification,
        ...(reasons.length ? ['stale'] : []), ...reasons,
        ...(supersededBy.length ? ['superseded'] : []), ...(conflictIds.size ? ['conflict'] : [])],
      stale: reasons.length > 0, supersededBy: supersededBy.sort(), conflictsWith: [...conflictIds].sort(),
    });
  }
  read(id, options) {
    string(id, 71, ID);
    const context = readOptions(options, this.#projectId, false);
    const value = this.#records.get(id);
    return value ? this.#view(value, context) : null;
  }
  search(query, options) {
    if (typeof query !== 'string' || query.length > LIMITS.queryChars) fail('Query exceeds limit or is not a string');
    const context = readOptions(options, this.#projectId, true);
    const needle = query.toLowerCase();
    return freeze([...this.#records.values()]
      .filter((value) => value.text.toLowerCase().includes(needle))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id))
      .slice(0, context.limit).map((value) => this.#view(value, context)));
  }
}
