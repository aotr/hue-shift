// The palette lock for --root runs: one JSON file per root that maps a
// project folder to the colour it was assigned. Keeping it makes a bulk
// palette stable when folders are added, removed or renamed.
// Zero dependencies.

import fs from "node:fs";
import path from "node:path";
import { normalizeColor } from "./colors.js";

export const LOCK_FILE = "hue-shift.lock.json";

export function lockPath(root) {
  return path.join(root, LOCK_FILE);
}

/** Read a root's lock. A missing file is an empty palette. Throws on bad data. */
export function readLock(root) {
  const file = lockPath(root);
  if (!fs.existsSync(file)) return { version: 1, projects: {} };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`invalid lock file ${file}: ${e.message}`);
  }

  if (!parsed || parsed.version !== 1) {
    throw new Error(`invalid lock file ${file}: expected version 1`);
  }
  if (!parsed.projects || typeof parsed.projects !== "object" || Array.isArray(parsed.projects)) {
    throw new Error(`invalid lock file ${file}: "projects" must be an object`);
  }

  const projects = {};
  for (const [name, value] of Object.entries(parsed.projects)) {
    const hex = normalizeColor(value);
    if (!hex) throw new Error(`invalid lock file ${file}: "${name}" is not a valid colour`);
    projects[name] = hex;
  }

  return { version: 1, projects };
}

/** Write a root's lock with sorted keys, atomically. */
export function writeLock(root, projects) {
  const file = lockPath(root);
  const sorted = {};
  for (const name of Object.keys(projects).sort()) {
    const hex = normalizeColor(projects[name]);
    if (!hex) throw new Error(`invalid colour for "${name}" in ${file}`);
    sorted[name] = hex;
  }

  const body = JSON.stringify({ version: 1, projects: sorted }, null, 2) + "\n";
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}
