// Argument parsing, config resolution and the command runner.
// Zero dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NAMED_COLORS,
  normalizeColor,
  randomColor,
  mulberry32,
  stableColor,
  listNamedColors,
  contrastRatio,
} from "./colors.js";
import {
  PART_KEYS,
  DEFAULT_PARTS,
  apply,
  reset,
  check,
  readSettings,
  parseJsonc,
  buildCustomizations,
} from "./settings.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, "..", "package.json"), "utf8"));

export const VERSION = PKG.version;
// HUE_SHIFT_CONFIG makes the global config path testable (and scriptable).
export const GLOBAL_CONFIG = process.env.HUE_SHIFT_CONFIG || path.join(os.homedir(), ".hue-shift.json");
export const PROJECT_CONFIG = ".hue-shift.json";

const USAGE = `hue-shift ${VERSION} - give every VS Code project its own window colour

USAGE
  hue-shift [project] [options]        one project (default: current directory)
  hue-shift --root <dir> [options]     every subfolder of <dir> as a project

COLOUR
  --random                 random colour per project
  --seed <n>               make --random reproducible
  --color <hex|name>       a specific colour (see --list-colors)
  --list-colors            print the built-in palette

APPEARANCE
  --parts <list>           title,activity,status,border,tab,sash,sidebar
                           default: title,activity,status
  --adjust <part=mode>     lighten|darken per part, comma separated
  --adjust-pct <n>         how much to shift, default 6
  --exclude <key>          never write this colour key (repeatable)
  --theme <name>           also set workbench.colorTheme
  --icons <name>           also set workbench.iconTheme

CHECKS
  --check                  report drift, does not write
  --reset                  remove every colour key hue-shift wrote
  --dry                    print the plan, write nothing
  --json                   machine-readable output

  -h, --help               this text
  -v, --version            print version

EXAMPLES
  npx hue-shift --random
  npx hue-shift --root ~/Documents/projects --random --seed 42
  npx hue-shift . --color amber --parts title,status
  npx hue-shift --root ~/code --check
  npx hue-shift --root ~/code --reset`;

function fail(message) {
  const err = new Error(message);
  err.usage = true;
  throw err;
}

const isFlag = (a) => a.startsWith("-");
const need = (argv, i, name) => {
  const v = argv[i];
  if (v === undefined || isFlag(v)) fail(`${name} needs a value`);
  return v;
};

export function parseArgs(argv) {
  const opts = {
    projects: [],
    roots: [],
    parts: null,
    adjust: null,
    adjustPct: null,
    excluded: [],
    theme: null,
    icons: null,
    color: null,
    random: false,
    seed: null,
    check: false,
    reset: false,
    dry: false,
    json: false,
    listColors: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-v" || a === "--version") opts.version = true;
    else if (a === "--list-colors") opts.listColors = true;
    else if (a === "--random") opts.random = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--reset") opts.reset = true;
    else if (a === "--dry") opts.dry = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--root") opts.roots.push(need(argv, ++i, "--root"));
    else if (a === "--seed") {
      const v = need(argv, ++i, "--seed");
      if (!/^-?\d+$/.test(v)) fail("--seed must be an integer");
      opts.seed = Number(v);
    } else if (a === "--color") opts.color = need(argv, ++i, "--color");
    else if (a === "--parts") {
      const parts = need(argv, ++i, "--parts").split(",").map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!PART_KEYS[p]) fail(`unknown part "${p}". Valid: ${Object.keys(PART_KEYS).join(", ")}`);
      }
      opts.parts = parts;
    }
    else if (a === "--exclude") opts.excluded.push(need(argv, ++i, "--exclude"));
    else if (a === "--theme") opts.theme = need(argv, ++i, "--theme");
    else if (a === "--icons") opts.icons = need(argv, ++i, "--icons");
    else if (a === "--adjust-pct") {
      const v = need(argv, ++i, "--adjust-pct");
      if (!/^\d+(\.\d+)?$/.test(v)) fail("--adjust-pct must be a number");
      opts.adjustPct = Number(v);
    } else if (a === "--adjust") {
      const raw = need(argv, ++i, "--adjust");
      const adjust = {};
      for (const piece of raw.split(",")) {
        const [part, mode] = piece.split("=").map((s) => s && s.trim());
        if (!part || !mode) fail(`--adjust expects part=lighten|darken, got "${piece}"`);
        if (!PART_KEYS[part]) fail(`unknown part "${part}"`);
        if (!["lighten", "darken", "none"].includes(mode)) fail(`unknown adjust mode "${mode}"`);
        adjust[part] = mode;
      }
      opts.adjust = adjust;
    } else if (isFlag(a)) fail(`unknown flag ${a}`);
    else opts.projects.push(a);
  }

  if (opts.check && opts.reset) fail("--check and --reset cannot be combined");
  return opts;
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`invalid JSON in ${file}: ${e.message}`);
  }
}

/** Merge global config, then per-project config. CLI wins over both. */
export function loadConfig(projectDir) {
  const global = readJson(GLOBAL_CONFIG);
  const local = projectDir ? readJson(path.join(projectDir, PROJECT_CONFIG)) : {};
  return { ...global, ...local };
}

function validateParts(parts) {
  for (const p of parts) {
    if (!PART_KEYS[p]) fail(`unknown part "${p}". Valid: ${Object.keys(PART_KEYS).join(", ")}`);
  }
  return parts;
}

/** Turn CLI options + config into the option bag buildCustomizations/apply expect. */
export function resolveOptions(cli, config, color) {
  const parts = validateParts(cli.parts || config.parts || DEFAULT_PARTS);
  return {
    color,
    parts,
    adjust: cli.adjust || config.adjust || {},
    adjustPct: cli.adjustPct ?? config.adjustPct ?? 6,
    excluded: [...(config.exclude || []), ...cli.excluded],
    theme: cli.theme ?? config.theme ?? null,
    icons: cli.icons ?? config.icons ?? null,
    dry: cli.dry,
  };
}

const expand = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

export function resolveTargets(cli, cwd = process.cwd()) {
  const targets = [];
  const seen = new Set();
  const add = (name, dir) => {
    const key = process.platform === "win32" ? dir.toLowerCase() : dir;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ name, dir });
  };

  for (const root of cli.roots) {
    const dir = path.resolve(cwd, expand(root));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`not a directory: ${dir}`);
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name)
      .sort();
    if (children.length === 0) fail(`no project folders inside ${dir}`);
    for (const c of children) add(c, path.join(dir, c));
  }

  for (const p of cli.projects) {
    const dir = path.resolve(cwd, expand(p));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`not a directory: ${dir}`);
    add(path.basename(dir), dir);
  }

  if (targets.length === 0) add(path.basename(cwd) || cwd, cwd);
  return targets;
}

/** Colour currently written for a project, or null. */
function currentColor(dir) {
  const { exists, text } = readSettings(dir);
  if (!exists) return null;
  try {
    const parsed = parseJsonc(text);
    const c = parsed["workbench.colorCustomizations"] || {};
    return c["titleBar.activeBackground"] || c["activityBar.background"] || c["statusBar.background"] || null;
  } catch {
    return null;
  }
}

export function run(argv, { cwd = process.cwd(), out = console.log } = {}) {
  const cli = parseArgs(argv);

  if (cli.help) {
    out(USAGE);
    return { code: 0 };
  }
  if (cli.version) {
    out(VERSION);
    return { code: 0 };
  }
  if (cli.listColors) {
    const rows = listNamedColors();
    if (cli.json) out(JSON.stringify(rows, null, 2));
    else {
      const w = Math.max(...rows.map((r) => r.name.length));
      for (const r of rows) out(`${r.name.padEnd(w)}  ${r.hex}`);
    }
    return { code: 0 };
  }
  if (cli.check && cli.reset) fail("--check and --reset cannot be combined");

  const targets = resolveTargets(cli, cwd);
  const results = [];

  // --seed makes --random reproducible across the whole run.
  const rng = cli.seed !== null ? mulberry32(cli.seed) : Math.random;
  const usedHues = [];

  for (const [index, target] of targets.entries()) {
    const config = loadConfig(target.dir);

    const wantsRandom = cli.random || (config.random === true && cli.color === null && !cli.check);
    const explicit = cli.color || config.color || null;

    let color;
    if (explicit) {
      color = normalizeColor(explicit);
      if (!color) fail(`invalid colour "${explicit}". Try --list-colors`);
    } else if (wantsRandom) {
      color = randomColor(usedHues, rng, targets.length);
    } else if (cli.check) {
      // No base colour known: check runs in validate-only mode.
      color = null;
    } else if (cli.reset) {
      color = null;
    } else {
      color = stableColor(index);
    }

    const opts = resolveOptions(cli, config, color);

    if (cli.reset) {
      const before = currentColor(target.dir);
      const res = reset(target.dir, { dry: cli.dry, withPeacock: true });
      results.push({ project: target.name, dir: target.dir, color: before, status: res.status, removed: res.removed });
      continue;
    }

    if (cli.check) {
      const res = check(target.dir, opts);
      results.push({ project: target.name, dir: target.dir, color: res.color || color, status: res.status, diffs: res.diffs, warnings: res.warnings });
      continue;
    }

    const res = apply(target.dir, opts);
    const ratio = contrastRatio(color, "#ffffff");
    results.push({
      project: target.name,
      dir: target.dir,
      color,
      status: res.status,
      contrast: ratio === null ? null : Number(ratio.toFixed(2)),
    });
  }

  if (cli.json) {
    out(JSON.stringify({ version: VERSION, mode: cli.check ? "check" : cli.reset ? "reset" : "apply", results }, null, 2));
    return { code: results.some((r) => r.status === "error") ? 2 : 0 };
  }

  const w = Math.max(7, ...results.map((r) => r.project.length));
  for (const r of results) {
    const swatch = r.color || "-------";
    const extra = r.status === "drift" ? `  (${r.diffs.length} key(s) differ)` : r.removed ? `  (${r.removed.length} key(s))` : "";
    out(`${r.project.padEnd(w)}  ${swatch}  ${r.status}${extra}`);
  }

  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
  out(`\n${results.length} project(s): ${summary}${cli.dry ? " (dry run, nothing written)" : ""}`);

  return { code: results.some((r) => r.status === "error" || r.status === "invalid") ? 2 : 0 };
}

export { NAMED_COLORS, buildCustomizations };
