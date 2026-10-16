import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

const LIMIT = 1024 * 1024;

// Bind validation and a capped read to one opened object. The host must still
// keep input/journal directories under its sole holder's control; this is not a
// snapshot or an authority boundary against another writer to the same inode.
export function readBoundedJson(path, { allowMissing = false } = {}) {
  let fd;
  try {
    fd = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") {
      // Without O_NOFOLLOW, a dangling link can report ENOENT at open. Only a
      // genuinely absent entry is a new journal; never erase a present entry.
      try {
        lstatSync(path);
      } catch (entryError) {
        if (entryError.code === "ENOENT") return undefined;
        throw entryError;
      }
      throw new Error("INPUT_CHANGED");
    }
    throw error;
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error("INPUT_INVALID");
    if (before.size > LIMIT) throw new Error("INPUT_TOO_LARGE");
    // O_NOFOLLOW is unavailable on Windows. Check the already-opened identity
    // there too; a later pathname replacement cannot retarget this descriptor.
    const entry = lstatSync(path, { bigint: true });
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.dev !== before.dev ||
      entry.ino !== before.ino
    )
      throw new Error("INPUT_CHANGED");
    const buffer = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > LIMIT) throw new Error("INPUT_TOO_LARGE");
    const after = fstatSync(fd, { bigint: true });
    if (
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    )
      throw new Error("INPUT_CHANGED");
    return JSON.parse(buffer.toString("utf8", 0, length));
  } finally {
    closeSync(fd);
  }
}
