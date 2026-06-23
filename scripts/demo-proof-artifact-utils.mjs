// Shared helpers for Demo-Proof Playwright artifact tooling.
// Node built-ins only. No third-party dependencies.
//
// Exports:
//   findIndexHtml(dir)              -> string|null
//   openPath(targetPath)            -> { ok, error? }
//   extractZip(zipPath, destDir)    -> { ok, error?, entries }   (stored + deflate)
//   ensureDir(dir)
//
// The extractor is intentionally minimal — it supports the subset of
// ZIP features GitHub Actions artifact downloads use:
//   * stored entries (method 0)
//   * deflated entries (method 8)
//   * directory entries
// It rejects unsafe paths (absolute / .. traversal).

import {
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  statSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function findIndexHtml(dir) {
  const direct = join(dir, "index.html");
  if (existsSync(direct)) return direct;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === "index.html") return full;
    }
  }
  return null;
}

export function openPath(targetPath) {
  const opener =
    process.platform === "darwin"
      ? ["open", [targetPath]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", targetPath]]
        : ["xdg-open", [targetPath]];
  const r = spawnSync(opener[0], opener[1], { stdio: "ignore" });
  if (r.error || (typeof r.status === "number" && r.status !== 0)) {
    return { ok: false, error: r.error ?? new Error(`exit ${r.status}`) };
  }
  return { ok: true };
}

// ---------- Minimal ZIP extractor (Node built-ins only) ----------

function readBuf(fd, offset, length) {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = readSync(fd, buf, read, length - read, offset + read);
    if (n <= 0) break;
    read += n;
  }
  return buf.subarray(0, read);
}

function isUnsafePath(name) {
  if (!name) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  const parts = name.split(/[\\/]/);
  return parts.some((p) => p === "..");
}

function findEOCD(fd, fileSize) {
  // EOCD is at end of file; max comment is 65535. Scan last 64KB+22.
  const maxScan = Math.min(fileSize, 0xffff + 22);
  const start = fileSize - maxScan;
  const buf = readBuf(fd, start, maxScan);
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return { offset: start + i, buf: buf.subarray(i) };
    }
  }
  return null;
}

export function extractZip(zipPath, destDir) {
  const entries = [];
  let fd;
  try {
    ensureDir(destDir);
    const absDest = resolve(destDir);
    const size = statSync(zipPath).size;
    fd = openSync(zipPath, "r");

    const eocd = findEOCD(fd, size);
    if (!eocd) return { ok: false, error: new Error("EOCD not found"), entries };

    const cdSize = eocd.buf.readUInt32LE(12);
    const cdOffset = eocd.buf.readUInt32LE(16);
    const totalEntries = eocd.buf.readUInt16LE(10);

    const cd = readBuf(fd, cdOffset, cdSize);
    let p = 0;
    for (let i = 0; i < totalEntries; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) {
        return { ok: false, error: new Error(`Bad central directory at entry ${i}`), entries };
      }
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localHeaderOffset = cd.readUInt32LE(p + 42);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString("utf8");
      p += 46 + nameLen + extraLen + commentLen;

      if (isUnsafePath(name)) {
        return { ok: false, error: new Error(`Unsafe zip path rejected: ${name}`), entries };
      }

      // Read local file header to get its name+extra lengths (may differ from CD).
      const lfh = readBuf(fd, localHeaderOffset, 30);
      if (lfh.readUInt32LE(0) !== 0x04034b50) {
        return { ok: false, error: new Error(`Bad local header for ${name}`), entries };
      }
      const lfhNameLen = lfh.readUInt16LE(26);
      const lfhExtraLen = lfh.readUInt16LE(28);
      const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;

      const outPath = resolve(absDest, name);
      if (!outPath.startsWith(absDest + sep) && outPath !== absDest) {
        return { ok: false, error: new Error(`Unsafe resolved path: ${name}`), entries };
      }

      if (name.endsWith("/")) {
        ensureDir(outPath);
        entries.push({ name, type: "dir" });
        continue;
      }

      ensureDir(dirname(outPath));
      const raw = readBuf(fd, dataStart, compSize);
      let data;
      if (method === 0) {
        data = raw;
      } else if (method === 8) {
        try {
          data = inflateRawSync(raw);
        } catch (err) {
          return { ok: false, error: new Error(`Inflate failed for ${name}: ${err.message}`), entries };
        }
      } else {
        return { ok: false, error: new Error(`Unsupported compression method ${method} for ${name}`), entries };
      }
      writeFileSync(outPath, data);
      entries.push({ name, type: "file", size: data.length });
    }
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: err, entries };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}
