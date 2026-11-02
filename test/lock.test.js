import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { LOCK_FILE, lockPath, readLock, writeLock } = await import("../src/lock.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hue-shift-lock-"));

test("a missing lock reads as an empty palette", () => {
  assert.deepEqual(readLock(tmp()), { version: 1, projects: {} });
});

test("readLock parses and normalises a valid lock", () => {
  const root = tmp();
  fs.writeFileSync(lockPath(root), JSON.stringify({ version: 1, projects: { b: "#ABCDEF", a: "teal" } }));
  assert.deepEqual(readLock(root).projects, { b: "#abcdef", a: "#0f766e" });
});

test("readLock rejects malformed locks", () => {
  const cases = [
    ["bad json", "{ nope"],
    ["wrong version", JSON.stringify({ version: 2, projects: {} })],
    ["missing projects", JSON.stringify({ version: 1 })],
    ["projects is an array", JSON.stringify({ version: 1, projects: [] })],
    ["bad colour", JSON.stringify({ version: 1, projects: { a: "not-a-colour" } })],
  ];

  for (const [name, body] of cases) {
    const root = tmp();
    fs.writeFileSync(lockPath(root), body);
    assert.throws(() => readLock(root), /invalid lock file/, name);
  }
});

test("writeLock sorts keys, formats, and leaves no temp file", () => {
  const root = tmp();
  writeLock(root, { beta: "#222222", alpha: "#111111" });

  const expected = `{
  "version": 1,
  "projects": {
    "alpha": "#111111",
    "beta": "#222222"
  }
}
`;
  assert.equal(fs.readFileSync(lockPath(root), "utf8"), expected);
  assert.deepEqual(fs.readdirSync(root), [LOCK_FILE]);
});

test("writeLock replaces an existing lock atomically", () => {
  const root = tmp();
  writeLock(root, { alpha: "#111111" });
  writeLock(root, { alpha: "#333333" });

  assert.deepEqual(readLock(root).projects, { alpha: "#333333" });
  assert.deepEqual(fs.readdirSync(root), [LOCK_FILE]);
});

test("writeLock writes an empty palette", () => {
  const root = tmp();
  writeLock(root, {});
  assert.deepEqual(readLock(root), { version: 1, projects: {} });
});

test("writeLock rejects an invalid colour before writing", () => {
  const root = tmp();
  assert.throws(() => writeLock(root, { alpha: "not-a-colour" }), /invalid colour/);
  assert.equal(fs.existsSync(lockPath(root)), false);
});
