import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PART_KEYS,
  MANAGED_KEYS,
  buildCustomizations,
  stripJsonc,
  parseJsonc,
  findBlock,
  setScalar,
  apply,
  reset,
  restore,
  check,
  readSettings,
  BACKUP_RELATIVE,
} from "../src/settings.js";
import { contrastRatio, parseColor, rgbToHsl } from "../src/colors.js";

/** Fresh project dir; optional settings.json content. */
function project(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hue-shift-"));
  if (settings !== undefined) {
    fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), settings);
  }
  return dir;
}

const settingsFile = (dir) => path.join(dir, ".vscode", "settings.json");
const readFile = (dir) => fs.readFileSync(settingsFile(dir), "utf8");
const readJson = (dir) => parseJsonc(readFile(dir));

test("stripJsonc removes line and block comments", () => {
  const input = `{
    // a line comment
    "a": 1, /* inline */
    /* multi
       line */
    "b": 2
  }`;
  assert.deepEqual(JSON.parse(stripJsonc(input)), { a: 1, b: 2 });
});

test("stripJsonc removes trailing commas", () => {
  assert.deepEqual(JSON.parse(stripJsonc('{"a":1,"b":[1,2,],}')), { a: 1, b: [1, 2] });
});

test("stripJsonc leaves comment markers inside strings alone", () => {
  const input = '{"url":"https://example.com/a//b","glob":"**/.next/**","c":"/* not a comment */"}';
  assert.deepEqual(JSON.parse(stripJsonc(input)), {
    url: "https://example.com/a//b",
    glob: "**/.next/**",
    c: "/* not a comment */",
  });
});

test("stripJsonc survives escaped quotes", () => {
  const input = '{"a":"say \\"hi\\" // no"}';
  assert.equal(JSON.parse(stripJsonc(input)).a, 'say "hi" // no');
});

test("findBlock locates the object and ignores braces in strings", () => {
  const text = `{
    "x": "{{ not real }}",
    "workbench.colorCustomizations": { "a": "}" },
    "y": 1
  }`;
  const [start, end] = findBlock(text, "workbench.colorCustomizations");
  assert.equal(text.slice(start, end), '{ "a": "}" }');
});

test("findBlock ignores braces inside comments", () => {
  const text = `{
    "workbench.colorCustomizations": {
      // } closing brace in a comment
      "a": 1
    }
  }`;
  const [start, end] = findBlock(text, "workbench.colorCustomizations");
  assert.equal(parseJsonc(text.slice(start, end)).a, 1);
});

test("findBlock returns null when the key is absent", () => {
  assert.equal(findBlock('{"a":1}', "workbench.colorCustomizations"), null);
});

test("setScalar replaces an existing value", () => {
  const out = setScalar('{\n  "workbench.colorTheme": "Monokai"\n}', "workbench.colorTheme", "Seti");
  assert.equal(readPlain(out)["workbench.colorTheme"], "Seti");
});

test("setScalar appends a missing value with correct commas", () => {
  const out = setScalar('{\n  "editor.tabSize": 2\n}\n', "workbench.iconTheme", "Seti");
  const parsed = readPlain(out);
  assert.equal(parsed["editor.tabSize"], 2);
  assert.equal(parsed["workbench.iconTheme"], "Seti");
});

test("setScalar handles an otherwise empty object", () => {
  const out = setScalar("{}\n", "workbench.colorTheme", "Monokai");
  assert.deepEqual(readPlain(out), { "workbench.colorTheme": "Monokai" });
});

function readPlain(text) {
  return JSON.parse(stripJsonc(text));
}

test("buildCustomizations colours the three default parts", () => {
  const out = buildCustomizations({ color: "#b45309" });
  assert.equal(out["titleBar.activeBackground"], "#b45309");
  assert.equal(out["activityBar.background"], "#b45309");
  assert.equal(out["statusBar.background"], "#b45309");
  assert.equal(out["window.activeBorder"], undefined);
  // Foreground is readable on every background it writes.
  for (const key of ["titleBar.activeForeground", "activityBar.foreground", "statusBar.foreground"]) {
    assert.ok(contrastRatio(out[key === "titleBar.activeForeground" ? "titleBar.activeBackground" : key.replace(/foreground|\.foreground$/i, "background")] || "#b45309", out[key]) >= 4.5);
  }
});

test("buildCustomizations honours --parts", () => {
  const out = buildCustomizations({ color: "#0f766e", parts: ["border", "tab", "sash", "sidebar"] });
  assert.deepEqual(Object.keys(out).sort(), [...PART_KEYS.border, ...PART_KEYS.tab, ...PART_KEYS.sash, ...PART_KEYS.sidebar].sort());
  assert.equal(out["statusBar.background"], undefined);
});

test("buildCustomizations applies per-part adjust", () => {
  const base = buildCustomizations({ color: "#b45309", parts: ["title", "status"] });
  const adjusted = buildCustomizations({ color: "#b45309", parts: ["title", "status"], adjust: { title: "lighten" }, adjustPct: 10 });
  assert.notEqual(adjusted["titleBar.activeBackground"], base["titleBar.activeBackground"]);
  assert.equal(adjusted["statusBar.background"], base["statusBar.background"], "unnadjusted part is untouched");
  const { l } = rgbToHsl(parseColor(adjusted["titleBar.activeBackground"]));
  assert.ok(l > 20, "lightened stays light enough to exist");
});

test("buildCustomizations skips excluded keys", () => {
  const out = buildCustomizations({ color: "#b45309", excluded: ["statusBar.background", "titleBar.activeForeground"] });
  assert.equal(out["statusBar.background"], undefined);
  assert.equal(out["titleBar.activeForeground"], undefined);
  assert.equal(out["titleBar.activeBackground"], "#b45309");
});

test("apply creates settings.json when absent", () => {
  const dir = project();
  const res = apply(dir, { color: "#b45309" });
  assert.equal(res.status, "created");
  const parsed = readJson(dir);
  assert.equal(parsed["workbench.colorCustomizations"]["titleBar.activeBackground"], "#b45309");
});

test("apply writes theme and icons on a brand new file", () => {
  const dir = project();
  apply(dir, { color: "#b45309", theme: "Monokai", icons: "Seti" });
  const parsed = readJson(dir);
  assert.equal(parsed["workbench.colorTheme"], "Monokai");
  assert.equal(parsed["workbench.iconTheme"], "Seti");
});

test("apply preserves unrelated settings and comments", () => {
  const dir = project(`{
  // do not lose me
  "editor.tabSize": 2,
  "eslint.enable": true,
  /* block */
  "search.exclude": { "**/.next": true }
}
`);
  apply(dir, { color: "#0f766e" });
  const text = readFile(dir);
  assert.match(text, /do not lose me/);
  assert.match(text, /block/);
  const parsed = readJson(dir);
  assert.equal(parsed["editor.tabSize"], 2);
  assert.equal(parsed["eslint.enable"], true);
  assert.deepEqual(parsed["search.exclude"], { "**/.next": true });
});

test("apply replaces an existing colorCustomizations block", () => {
  const dir = project(`{
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#000000",
    "statusBar.background": "#111111"
  }
}
`);
  apply(dir, { color: "#b45309", parts: ["title"] });
  const parsed = readJson(dir);
  assert.equal(parsed["workbench.colorCustomizations"]["titleBar.activeBackground"], "#b45309");
  assert.equal(parsed["workbench.colorCustomizations"]["statusBar.background"], undefined, "old keys replaced");
});

test("apply inserts the block when the key is missing", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  const res = apply(dir, { color: "#b45309" });
  assert.equal(res.status, "inserted");
  const parsed = readJson(dir);
  assert.equal(parsed["editor.tabSize"], 2);
  assert.equal(parsed["workbench.colorCustomizations"]["titleBar.activeBackground"], "#b45309");
});

test("apply is idempotent", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  const first = readFile(dir);
  const res = apply(dir, { color: "#b45309" });
  assert.equal(res.status, "unchanged");
  assert.equal(readFile(dir), first);
});

test("apply syncs peacock.color when present", () => {
  const dir = project('{\n  "peacock.color": "#000000"\n}\n');
  apply(dir, { color: "#b45309" });
  assert.equal(readJson(dir)["peacock.color"], "#b45309");
});

test("apply leaves peacock alone when the project does not use it", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  apply(dir, { color: "#b45309" });
  assert.equal(readJson(dir)["peacock.color"], undefined);
});

test("apply preserves a UTF-8 BOM", () => {
  const dir = project("\uFEFF{\n  \"editor.tabSize\": 2\n}\n");
  apply(dir, { color: "#b45309" });
  assert.ok(readFile(dir).startsWith("\uFEFF"), "BOM survives");
  assert.equal(readJson(dir)["editor.tabSize"], 2);
});

test("apply preserves CRLF line endings", () => {
  const dir = project('{\r\n  "editor.tabSize": 2\r\n}\r\n');
  apply(dir, { color: "#b45309" });
  const text = readFile(dir);
  assert.ok(text.includes("\r\n"), "still CRLF");
  assert.ok(!/[^\r]\n/.test(text.replace(/\r\n/g, "")), "no stray LF");
  assert.equal(readJson(dir)["editor.tabSize"], 2);
});

test("apply does not write in dry mode", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  const before = readFile(dir);
  const res = apply(dir, { color: "#b45309", dry: true });
  assert.equal(res.status, "dry");
  assert.equal(readFile(dir), before);
});

test("reset removes managed keys and keeps everything else", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  apply(dir, { color: "#b45309", theme: "Monokai" });
  const res = reset(dir, { withPeacock: true });
  assert.equal(res.status, "reset");
  const parsed = readJson(dir);
  assert.equal(parsed["editor.tabSize"], 2);
  assert.equal(parsed["workbench.colorCustomizations"], undefined);
  assert.equal(parsed["workbench.colorTheme"], "Monokai", "theme is not a colour key");
});

test("reset keeps colour keys it does not own", () => {
  const dir = project(`{
  "workbench.colorCustomizations": {
    "editor.background": "#123456"
  }
}
`);
  apply(dir, { color: "#b45309" });
  reset(dir);
  const colors = readJson(dir)["workbench.colorCustomizations"];
  assert.deepEqual(colors, { "editor.background": "#123456" });
});

test("reset is idempotent", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  assert.equal(reset(dir).status, "reset");
  assert.equal(reset(dir).status, "clean");
});

test("reset reports missing when there is no settings file", () => {
  const dir = project();
  assert.equal(reset(dir).status, "missing");
});

test("reset produces valid JSON when the block was the only key", () => {
  const dir = project('{\n  "workbench.colorCustomizations": { "titleBar.activeBackground": "#123456" }\n}\n');
  reset(dir);
  assert.doesNotThrow(() => JSON.parse(readFile(dir)));
});

test("check reports ok right after apply", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  assert.equal(check(dir, { color: "#b45309" }).status, "ok");
});

test("check reports drift when a value is hand-edited", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  const text = readFile(dir).replace("#b45309", "#ff0000");
  fs.writeFileSync(settingsFile(dir), text);
  const res = check(dir, { color: "#b45309" });
  assert.equal(res.status, "drift");
  assert.ok(res.diffs.length > 0);
  assert.equal(res.diffs[0].expected, "#b45309");
  assert.equal(res.diffs[0].actual, "#ff0000");
});

test("check reports missing when there is no settings file", () => {
  const dir = project();
  assert.equal(check(dir, { color: "#b45309" }).status, "missing");
});

test("check reports invalid JSONC", () => {
  const dir = project("{ this is not json");
  assert.equal(check(dir, { color: "#b45309" }).status, "invalid");
});

test("check validates contrast when no base colour is known", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  const res = check(dir, { color: null });
  assert.equal(res.status, "ok");
  assert.equal(res.color, "#b45309");
});

test("check flags unreadable foregrounds in validate mode", () => {
  const dir = project(`{
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#777777",
    "titleBar.activeForeground": "#888888"
  }
}
`);
  const res = check(dir, { color: null });
  assert.equal(res.status, "drift");
  assert.match(res.warnings.join(" "), /contrast/i);
});

test("check in validate mode reports missing when no colour exists", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  assert.equal(check(dir, { color: null }).status, "missing");
});

test("reset drops peacock.color when it matches the colour we wrote", () => {
  const dir = project('{\n  "peacock.color": "#000000"\n}\n');
  apply(dir, { color: "#b45309" });
  assert.equal(readJson(dir)["peacock.color"], "#b45309", "apply synced it");

  const res = reset(dir);
  assert.ok(res.removed.includes("peacock.color"));
  assert.equal(readJson(dir)["peacock.color"], undefined);
});

test("reset keeps a peacock.color that Peacock set independently", () => {
  const dir = project('{\n  "peacock.color": "#123456"\n}\n');
  apply(dir, { color: "#b45309" });
  // Simulate Peacock taking the setting back.
  fs.writeFileSync(settingsFile(dir), readFile(dir).replace("#b45309", "#123456"));

  const res = reset(dir);
  assert.ok(!res.removed.includes("peacock.color"));
  assert.equal(readJson(dir)["peacock.color"], "#123456", "not ours to delete");
});

test("readSettings reports the file and newline style", () => {
  const dir = project('{\r\n  "a": 1\r\n}\r\n');
  const s = readSettings(dir);
  assert.equal(s.exists, true);
  assert.equal(s.nl, "\r\n");
  assert.ok(s.file.endsWith(path.join(".vscode", "settings.json")));
});

test("restore puts settings.json back byte for byte", () => {
  const original = '\uFEFF{\r\n  // keep me\r\n  "editor.tabSize": 2\r\n}\r\n';
  const dir = project(original);
  apply(dir, { color: "#b45309" });
  assert.notEqual(readFile(dir), original);

  const res = restore(dir);
  assert.equal(res.status, "restored");
  assert.equal(fs.readFileSync(settingsFile(dir), "utf8"), original);
  assert.equal(fs.existsSync(path.join(dir, BACKUP_RELATIVE)), false, "backup consumed");
});

test("restore removes settings.json when apply created it", () => {
  const dir = project();
  apply(dir, { color: "#b45309" });
  assert.ok(fs.existsSync(settingsFile(dir)));

  assert.equal(restore(dir).status, "restored");
  assert.equal(fs.existsSync(settingsFile(dir)), false);
});

test("the first apply wins; later applies keep the original backup", () => {
  const dir = project('{\n  "editor.tabSize": 2\n}\n');
  const original = readFile(dir);
  apply(dir, { color: "#b45309" });
  apply(dir, { color: "#0f766e" });

  assert.equal(restore(dir).status, "restored");
  assert.equal(readFile(dir), original);
});

test("restore is missing when settings exist but no backup does", () => {
  assert.equal(restore(project('{\n  "a": 1\n}\n')).status, "missing");
});

test("restore is clean when there is nothing at all", () => {
  assert.equal(restore(project()).status, "clean");
});

test("restore --dry leaves the file and backup alone", () => {
  const dir = project('{\n  "a": 1\n}\n');
  apply(dir, { color: "#b45309" });
  const coloured = readFile(dir);

  assert.equal(restore(dir, { dry: true }).status, "dry");
  assert.equal(readFile(dir), coloured);
  assert.ok(fs.existsSync(path.join(dir, BACKUP_RELATIVE)));
});

test("a corrupt backup is invalid, not destructive", () => {
  const dir = project('{\n  "a": 1\n}\n');
  apply(dir, { color: "#b45309" });
  const coloured = readFile(dir);
  fs.writeFileSync(path.join(dir, BACKUP_RELATIVE), "not json");

  assert.equal(restore(dir).status, "invalid");
  assert.equal(readFile(dir), coloured);
});

test("MANAGED_KEYS covers every part", () => {
  for (const keys of Object.values(PART_KEYS)) {
    for (const k of keys) assert.ok(MANAGED_KEYS.includes(k), `${k} missing from MANAGED_KEYS`);
  }
  assert.ok(MANAGED_KEYS.includes("peacock.color"));
});
