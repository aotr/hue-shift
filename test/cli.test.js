import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the global config somewhere harmless before importing the CLI.
const CONFIG = path.join(os.tmpdir(), `hue-shift-global-${process.pid}.json`);
process.env.HUE_SHIFT_CONFIG = CONFIG;
fs.rmSync(CONFIG, { force: true });

const { parseArgs, resolveTargets, run, VERSION, loadConfig } = await import("../src/cli.js");
const { parseJsonc } = await import("../src/settings.js");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hue-shift-cli-"));
}

/** Run the CLI and capture stdout. */
function cli(args, cwd) {
  const lines = [];
  const { code } = run(args, { cwd, out: (l) => lines.push(l) });
  return { code, out: lines.join("\n"), json: () => JSON.parse(lines.join("\n")) };
}

const settingsOf = (dir) => parseJsonc(fs.readFileSync(path.join(dir, ".vscode", "settings.json"), "utf8"));

test("parseArgs returns sane defaults", () => {
  const o = parseArgs([]);
  assert.deepEqual(o.projects, []);
  assert.deepEqual(o.roots, []);
  assert.equal(o.random, false);
  assert.equal(o.dry, false);
  assert.equal(o.json, false);
  assert.equal(o.seed, null);
});

test("parseArgs reads every documented flag", () => {
  const o = parseArgs([
    "--root", "a", "--root", "b",
    "--random", "--seed", "7",
    "--color", "teal",
    "--parts", "title,status",
    "--adjust", "title=lighten,status=darken",
    "--adjust-pct", "9",
    "--exclude", "statusBar.background",
    "--theme", "Monokai", "--icons", "Seti",
    "--dry", "--json",
  ]);
  assert.deepEqual(o.roots, ["a", "b"]);
  assert.equal(o.seed, 7);
  assert.equal(o.color, "teal");
  assert.deepEqual(o.parts, ["title", "status"]);
  assert.deepEqual(o.adjust, { title: "lighten", status: "darken" });
  assert.equal(o.adjustPct, 9);
  assert.deepEqual(o.excluded, ["statusBar.background"]);
  assert.equal(o.theme, "Monokai");
  assert.equal(o.icons, "Seti");
  assert.equal(o.dry, true);
  assert.equal(o.json, true);
});

test("parseArgs rejects bad input", () => {
  const bad = [
    ["--nope"],
    ["--seed"],
    ["--seed", "abc"],
    ["--parts", "bogus"],
    ["--adjust", "title"],
    ["--adjust", "title=sideways"],
    ["--adjust", "bogus=lighten"],
    ["--adjust-pct", "wide"],
  ];
  for (const args of bad) {
    assert.throws(() => parseArgs(args), undefined, `expected throw for ${args.join(" ")}`);
  }
});

test("resolveTargets defaults to the current directory as one project", () => {
  const dir = tmp();
  const targets = resolveTargets(parseArgs([]), dir);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].dir, dir);
  assert.equal(targets[0].name, path.basename(dir));
});

test("resolveTargets scans a root directory", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "alpha"));
  fs.mkdirSync(path.join(root, "beta"));
  fs.mkdirSync(path.join(root, ".hidden"));
  const targets = resolveTargets(parseArgs(["--root", root]), tmp());
  assert.deepEqual(targets.map((t) => t.name), ["alpha", "beta"], "hidden folders skipped, sorted");
});

test("resolveTargets accepts explicit project paths", () => {
  const root = tmp();
  const a = path.join(root, "one");
  const b = path.join(root, "two");
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  const targets = resolveTargets(parseArgs([a, b]), tmp());
  assert.deepEqual(targets.map((t) => t.name), ["one", "two"]);
});

test("resolveTargets errors on a missing directory", () => {
  const cliArgs = parseArgs(["--root", path.join(tmp(), "nope")]);
  assert.throws(() => resolveTargets(cliArgs, tmp()), /not a directory/);
});

test("--help and --version exit 0", () => {
  assert.equal(cli(["--help"]).code, 0);
  assert.match(cli(["--help"]).out, /USAGE/);
  const v = cli(["--version"]);
  assert.equal(v.code, 0);
  assert.equal(v.out, VERSION);
});

test("--list-colors prints the palette", () => {
  const { code, out } = cli(["--list-colors"]);
  assert.equal(code, 0);
  assert.match(out, /amber\s+#b45309/);
  assert.match(out, /violet\s+#6d28d9/);
});

test("--list-colors --json is machine readable", () => {
  const rows = cli(["--list-colors", "--json"]).json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.some((r) => r.name === "amber" && r.hex === "#b45309"));
});

test("apply writes a colour and returns 0", () => {
  const dir = tmp();
  const { code } = cli([dir, "--color", "amber"]);
  assert.equal(code, 0);
  assert.equal(settingsOf(dir)["workbench.colorCustomizations"]["titleBar.activeBackground"], "#b45309");
});

test("--dry writes nothing", () => {
  const dir = tmp();
  cli([dir, "--color", "amber", "--dry"]);
  assert.equal(fs.existsSync(path.join(dir, ".vscode")), false);
});

test("--seed makes --random reproducible", () => {
  const root = tmp();
  for (const n of ["a", "b", "c"]) fs.mkdirSync(path.join(root, n));

  cli(["--root", root, "--random", "--seed", "42"]);
  const first = ["a", "b", "c"].map((n) => settingsOf(path.join(root, n))["workbench.colorCustomizations"]["titleBar.activeBackground"]);

  for (const n of ["a", "b", "c"]) fs.rmSync(path.join(root, n), { recursive: true });
  for (const n of ["a", "b", "c"]) fs.mkdirSync(path.join(root, n));

  cli(["--root", root, "--random", "--seed", "42"]);
  const second = ["a", "b", "c"].map((n) => settingsOf(path.join(root, n))["workbench.colorCustomizations"]["titleBar.activeBackground"]);

  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 3, "three projects get three colours");
});

test("--json reports per-project results", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "a"));
  fs.mkdirSync(path.join(root, "b"));
  const { json } = cli(["--root", root, "--random", "--seed", "1", "--json"]);
  const payload = json();
  assert.equal(payload.mode, "apply");
  assert.equal(payload.results.length, 2);
  for (const r of payload.results) {
    assert.match(r.color, /^#[0-9a-f]{6}$/);
    assert.equal(r.status, "created");
  }
});

test("--check passes after apply and fails after tampering", () => {
  const dir = tmp();
  cli([dir, "--color", "amber"]);

  const ok = cli([dir, "--color", "amber", "--check", "--json"]).json();
  assert.equal(ok.results[0].status, "ok");

  const file = path.join(dir, ".vscode", "settings.json");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("#b45309", "#00ff00"));

  const drift = cli([dir, "--color", "amber", "--check", "--json"]).json();
  assert.equal(drift.results[0].status, "drift");
  assert.ok(drift.results[0].diffs.length > 0);
});

test("--check with no colour validates instead of comparing", () => {
  const dir = tmp();
  cli([dir, "--color", "teal"]);
  const res = cli([dir, "--check", "--json"]).json();
  assert.equal(res.results[0].status, "ok");
});

test("--reset removes the colour and is idempotent", () => {
  const dir = tmp();
  cli([dir, "--color", "amber"]);
  const first = cli([dir, "--reset", "--json"]).json();
  assert.equal(first.results[0].status, "reset");
  assert.equal(settingsOf(dir)["workbench.colorCustomizations"], undefined);

  const second = cli([dir, "--reset", "--json"]).json();
  assert.equal(second.results[0].status, "clean");
});

test("--check exits non-zero on drift", () => {
  const dir = tmp();
  cli([dir, "--color", "amber"]);

  assert.equal(cli([dir, "--color", "amber", "--check"]).code, 0, "clean is 0");

  const file = path.join(dir, ".vscode", "settings.json");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("#b45309", "#ff0000"));

  assert.equal(cli([dir, "--color", "amber", "--check"]).code, 2, "drift is 2");
  assert.equal(cli([dir, "--color", "amber", "--check", "--json"]).code, 2, "json mode too");
});

test("--check exits non-zero when a project has no colour", () => {
  const dir = tmp();
  assert.equal(cli([dir, "--check"]).code, 2);
});

test("--check exits non-zero on an invalid settings file", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), "{ broken");
  assert.equal(cli([dir, "--check"]).code, 2);
});

test("--reset exits 0 whether or not there was anything to remove", () => {
  const dir = tmp();
  cli([dir, "--color", "amber"]);
  assert.equal(cli([dir, "--reset"]).code, 0);
  assert.equal(cli([dir, "--reset"]).code, 0, "second run is clean, still 0");
});

test("a successful apply exits 0", () => {
  const dir = tmp();
  assert.equal(cli([dir, "--color", "amber"]).code, 0);
});

test("--check and --reset together is a usage error", () => {
  assert.throws(() => parseArgs(["--check", "--reset"]), /cannot be combined/);
});

test("--parts limits which keys are written", () => {
  const dir = tmp();
  cli([dir, "--color", "teal", "--parts", "title"]);
  const colors = settingsOf(dir)["workbench.colorCustomizations"];
  assert.ok(colors["titleBar.activeBackground"]);
  assert.equal(colors["statusBar.background"], undefined);
});

test("--exclude keeps your own key", () => {
  const dir = tmp();
  cli([dir, "--color", "teal", "--exclude", "statusBar.background"]);
  const colors = settingsOf(dir)["workbench.colorCustomizations"];
  assert.equal(colors["statusBar.background"], undefined);
  assert.ok(colors["titleBar.activeBackground"]);
});

test("--theme and --icons are written alongside the colour", () => {
  const dir = tmp();
  cli([dir, "--color", "teal", "--theme", "Monokai", "--icons", "Seti"]);
  const s = settingsOf(dir);
  assert.equal(s["workbench.colorTheme"], "Monokai");
  assert.equal(s["workbench.iconTheme"], "Seti");
});

test("project config supplies defaults and CLI wins over it", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, ".hue-shift.json"), JSON.stringify({ color: "violet", parts: ["title"] }));

  assert.equal(loadConfig(dir).color, "violet");

  cli([dir]);
  assert.equal(settingsOf(dir)["workbench.colorCustomizations"]["titleBar.activeBackground"], "#6d28d9");

  cli([dir, "--color", "amber"]);
  assert.equal(settingsOf(dir)["workbench.colorCustomizations"]["titleBar.activeBackground"], "#b45309", "CLI wins");
});

test("invalid colour is a usage error", () => {
  const dir = tmp();
  assert.throws(() => cli([dir, "--color", "chartreuse"]), /invalid colour/);
});

test("an unreadable settings file surfaces as invalid, not a crash", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), "{ broken");
  const res = cli([dir, "--check", "--json"]).json();
  assert.equal(res.results[0].status, "invalid");
});

test("--restore puts settings.json back as it was before the first apply", () => {
  const dir = tmp();
  const file = path.join(dir, ".vscode", "settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = '{\n  "editor.tabSize": 2\n}\n';
  fs.writeFileSync(file, original);

  cli([dir, "--color", "amber"]);
  assert.notEqual(fs.readFileSync(file, "utf8"), original);

  assert.equal(cli([dir, "--restore"]).code, 0);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("--restore exits 2 when settings exist but there is no backup", () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), "{}");
  assert.equal(cli([dir, "--restore"]).code, 2);
});

test("--restore on an untouched folder exits 0", () => {
  assert.equal(cli([tmp(), "--restore"]).code, 0);
});

test("--restore --json reports the mode", () => {
  const dir = tmp();
  cli([dir, "--color", "amber"]);
  const res = cli([dir, "--restore", "--json"]).json();
  assert.equal(res.mode, "restore");
  assert.equal(res.results[0].status, "restored");
});

test("--restore cannot be combined with --check or --reset", () => {
  assert.throws(() => cli([tmp(), "--restore", "--check"]), /cannot be combined/);
  assert.throws(() => cli([tmp(), "--restore", "--reset"]), /cannot be combined/);
});
