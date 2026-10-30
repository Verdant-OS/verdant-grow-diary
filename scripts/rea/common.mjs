import { createHash } from 'node:crypto';

export const TARGET = 'https://verdantgrowdiary.com/';
export const REA_VERSION = '6.8.0';
const REDACTED = '[REDACTED]';
const sensitiveKey = /^(?:password|passwd|authorization|proxy-authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|x-api-key|client[_-]?secret|secret|private[_-]?key)$/i;
const alreadyRedacted = /^(?:\[redacted\]|<redacted>|redacted)$/i;
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const keyLike = /\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|sb-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|(?:live|test)_[A-Za-z0-9_-]{16,})\b/g;
const credentialPart = /(?:password|token|cookie|authorization|(?:^|[-_])(?:key|secret|code|session|signature|credential)(?:$|[-_]))/i;

function scrubUrl(raw) {
  try {
    const u = new URL(raw, 'https://redaction.invalid');
    let unsafe = Boolean(u.username || u.password);
    const parts = [...u.searchParams, ...new URLSearchParams(u.hash.slice(1))];
    for (const [name, original] of parts) {
      let value = original;
      for (let count = 0; count < 2; count++) { try { value = decodeURIComponent(value); } catch { break; } }
      if ((credentialPart.test(name) && value && !alreadyRedacted.test(value)) ||
          /(?:password|token|api[_-]?key|secret|authorization)[^\w]*[=:]/i.test(value) ||
          /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/.test(value)) unsafe = true;
    }
    if (!unsafe) return raw;
    if (u.username || u.password) { u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.href; }
    return raw.split(/[?#]/)[0] || REDACTED;
  } catch { return REDACTED; }
}

export function redact(value, key = '') {
  if (sensitiveKey.test(key) && value != null && value !== '' &&
      !(typeof value === 'string' && alreadyRedacted.test(value))) return REDACTED;
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    const header = sensitiveKey.test(value.name ?? '') && value.value && !alreadyRedacted.test(String(value.value));
    return Object.fromEntries(Object.entries(value).map(([name, item]) =>
      [name, header && name === 'value' ? REDACTED : redact(item, name)]));
  }
  if (typeof value !== 'string') return value;
  const urls = value.replace(/(?:https?|wss?):\/\/[^\s"'<>]+/g, scrubUrl);
  return (/^[/?#]/.test(urls) ? scrubUrl(urls) : urls).replace(jwt, REDACTED).replace(keyLike, REDACTED)
    .replace(/\bBearer\s+[^\s"',;}]+/gi, `Bearer ${REDACTED}`)
    .replace(/((?:password|api[_-]?key|secret|access[_-]?token)\s*[=:]\s*)[^\s"',;}]+/gi, `$1${REDACTED}`);
}

// Fail closed rather than modify canonical REA records and invalidate their identities.
export function assertSafeEvidence(record) {
  if (!record || typeof record !== 'object' || record.raw_result !== null) {
    throw new Error('Unsafe REA evidence: raw payload or unsupported result; no export written.');
  }
  if (JSON.stringify(redact(record)) !== JSON.stringify(record)) {
    throw new Error('Unsafe REA evidence requires redaction; session discarded before export.');
  }
}

export function validateCommit(commit) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('--commit requires an exact lowercase 40-character SHA.');
  return commit;
}

export function validateTarget(target = TARGET) {
  if (target !== TARGET && target !== TARGET.slice(0, -1)) {
    throw new Error('Job 3 is limited to https://verdantgrowdiary.com/ without query, fragment or credentials.');
  }
  return TARGET;
}

export function metadata({ url, commit, reaVersion, now = new Date() }) {
  return {
    target_url: validateTarget(url), reference_commit: validateCommit(commit),
    deployed_commit: 'NOT_MEASURED', rea_version: reaVersion,
    captured_at_utc: now.toISOString(),
    captured_at_ct: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'long',
    }).format(now),
  };
}

export const digest = value => createHash('sha256').update(value).digest('hex');
export const isoDirectory = date => date.toISOString().replace(/[-:]/g, '');
