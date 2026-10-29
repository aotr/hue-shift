// Reading and writing .vscode/settings.json without destroying anything.
// Handles JSONC (comments), trailing commas, UTF-8 BOM and CRLF line endings.
// Zero dependencies.

import fs from "node:fs";
import path from "node:path";
import { readableForeground, lighten, darken, contrastRatio } from "./colors.js";

/**
 * Which VS Code colour keys each window part owns.
 * `parts` selects a subset; every key listed here is also what --reset removes.
 */
export const PART_KEYS = {
  title: [
    "titleBar.activeBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveBackground",
    "titleBar.inactiveForeground",
  ],
  activity: [
    "activityBar.background",
    "activityBar.foreground",
    "activityBar.inactiveForeground",
    "activityBar.activeBackground",
  ],
  status: [
    "statusBar.background",
    "statusBar.foreground",
    "statusBar.debuggingBackground",
    "statusBar.noFolderBackground",
  ],
  border: ["window.activeBorder", "window.inactiveBorder"],
  tab: ["tab.activeBackground", "tab.activeForeground", "tab.activeBorderTop"],
  sash: ["sash.hoverBorder"],
  sidebar: ["sideBar.background", "sideBar.foreground"],
};

export const DEFAULT_PARTS = ["title", "activity", "status"];

/** Every key hue-shift may write. --reset removes exactly these. */
export const MANAGED_KEYS = [
  ...new Set([].concat(...Object.values(PART_KEYS))),
  "peacock.color",
];

export const SETTINGS_RELATIVE = path.join(".vscode", "settings.json");

const tint = (hex, alpha) => `${hex}${alpha}`;

/**
 * Build the workbench.colorCustomizations object for one project.
 *
 * opts: { color, parts, adjust, adjustPct, excluded }
 *   adjust   - { title: "lighten"|"darken"|"none", ... }
 *   excluded - array of colour keys that must never be written
 */
export function buildCustomizations({ color, parts = DEFAULT_PARTS, adjust = {}, adjustPct = 6, excluded = [] }) {
  const skip = new Set(excluded);
  const out = {};

  const partColor = (part) => {
    const mode = adjust[part];
    if (mode === "lighten") return lighten(color, adjustPct);
    if (mode === "darken") return darken(color, adjustPct);
    return color;
  };

  const put = (key, value) => {
    if (!skip.has(key)) out[key] = value;
  };

  for (const part of parts) {
    if (!PART_KEYS[part]) continue;
    const bg = partColor(part);
    const fg = readableForeground(bg);

    if (part === "title") {
      put("titleBar.activeBackground", bg);
      put("titleBar.activeForeground", fg);
      put("titleBar.inactiveBackground", tint(bg, "cc"));
      put("titleBar.inactiveForeground", tint(fg, "99"));
    } else if (part === "activity") {
      put("activityBar.background", bg);
      put("activityBar.foreground", fg);
      put("activityBar.inactiveForeground", tint(fg, "88"));
      put("activityBar.activeBackground", bg);
    } else if (part === "status") {
      put("statusBar.background", bg);
      put("statusBar.foreground", fg);
      put("statusBar.debuggingBackground", bg);
      put("statusBar.noFolderBackground", bg);
    } else if (part === "border") {
      put("window.activeBorder", bg);
      put("window.inactiveBorder", tint(bg, "99"));
    } else if (part === "tab") {
      put("tab.activeBackground", bg);
      put("tab.activeForeground", fg);
      put("tab.activeBorderTop", bg);
    } else if (part === "sash") {
      put("sash.hoverBorder", bg);
    } else if (part === "sidebar") {
      put("sideBar.background", bg);
      put("sideBar.foreground", fg);
    }
  }

  return out;
}

/** Strip // and block comments plus trailing commas, respecting strings. */
export function stripJsonc(text) {
  let out = "";
  let i = 0;
  let inStr = false;
  let inLine = false;
  let inBlock = false;

  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];

    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n;
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }

  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse JSONC text into a value. Tolerates a leading BOM. Throws on real syntax errors. */
export function parseJsonc(text) {
  const clean = text.startsWith("\uFEFF") ? text.slice(1) : text;
  return JSON.parse(stripJsonc(clean));
}

/**
 * Locate the `{...}` object assigned to a top-level key.
 * Returns [start, end) or null. Brace matching skips strings and comments.
 */
export function findBlock(text, key) {
  const at = text.indexOf(`"${key}"`);
  if (at === -1) return null;
  const open = text.indexOf("{", at);
  if (open === -1) return null;

  let depth = 0;
  let i = open;
  let inStr = false;
  let inLine = false;
  let inBlock = false;

  for (; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [open, i + 1];
    }
  }
  return null;
}

/** Replace the value of a scalar string setting, or insert it at the root. */
export function setScalar(text, key, value, nl = "\n") {
  const quoted = JSON.stringify(value);
  const re = new RegExp(`("${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  if (re.test(text)) return text.replace(re, `$1${quoted}`);

  const close = text.lastIndexOf("}");
  if (close === -1) throw new Error("settings.json has no root object");
  const head = text.slice(0, close).replace(/\s+$/, "");
  const needsComma = /[^\s{]/.test(head);
  return `${head}${needsComma ? "," : ""}${nl}  "${key}": ${quoted}${nl}${text.slice(close)}`;
}

/** Remove a key from the object literal inside text. Best-effort, JSONC aware. */
function removeKey(text, key, nl) {
  const re = new RegExp(
    `(\\n[ \\t]*"${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"\\s*,?)`,
  );
  return text.replace(re, "");
}

function render(obj, indent, nl) {
  const pad = " ".repeat(indent);
  const body = Object.entries(obj)
    .map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join("," + nl);
  return `{${nl}${body}${nl}${pad}}`;
}

function splitBom(raw) {
  return raw.startsWith("\uFEFF") ? { bom: "\uFEFF", text: raw.slice(1) } : { bom: "", text: raw };
}

function newlineOf(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Read settings.json as { bom, text, nl, exists }. */
export function readSettings(dir) {
  const file = path.join(dir, SETTINGS_RELATIVE);
  if (!fs.existsSync(file)) return { file, exists: false, bom: "", text: "", nl: "\n" };
  const { bom, text } = splitBom(fs.readFileSync(file, "utf8"));
  return { file, exists: true, bom, text, nl: newlineOf(text) };
}

/**
 * Write the colour block into a project.
 * Returns { status, color, file } where status is created|updated|unchanged|dry.
 */
export function apply(dir, opts) {
  const colors = buildCustomizations(opts);
  const { file, exists, bom, text, nl } = readSettings(dir);

  if (!exists) {
    if (opts.dry) return { status: "dry", color: opts.color, file };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let content = `{${nl}  "workbench.colorCustomizations": ${render(colors, 2, nl)}${nl}}${nl}`;
    if (opts.theme) content = setScalar(content, "workbench.colorTheme", opts.theme, nl);
    if (opts.icons) content = setScalar(content, "workbench.iconTheme", opts.icons, nl);
    fs.writeFileSync(file, content);
    return { status: "created", color: opts.color, file };
  }

  let next = text;
  const range = findBlock(next, "workbench.colorCustomizations");
  let inserted = false;

  // Preserve colour keys this tool does not own, then overwrite our own.
  let preserved = {};
  if (range) {
    try {
      const existing = parseJsonc(next.slice(range[0], range[1]));
      preserved = Object.fromEntries(
        Object.entries(existing).filter(([k]) => !MANAGED_KEYS.includes(k)),
      );
    } catch {
      preserved = {};
    }
  }
  const merged = { ...preserved, ...colors };
  const block = render(merged, 2, nl);

  if (range) {
    next = next.slice(0, range[0]) + block + next.slice(range[1]);
  } else {
    const close = next.lastIndexOf("}");
    if (close === -1) throw new Error(`no root object in ${file}`);
    const needsComma = /[^\s{]/.test(next.slice(0, close));
    next = `${next.slice(0, close)}${needsComma ? "," : ""}${nl}  "workbench.colorCustomizations": ${block}${nl}${next.slice(close)}`;
    inserted = true;
  }

  // Keep Peacock agreeing with us when the project already uses it.
  if (/"peacock\.color"\s*:/.test(next)) {
    next = next.replace(/("peacock\.color"\s*:\s*)"[^"]*"/, `$1"${opts.color}"`);
  }

  if (opts.theme) next = setScalar(next, "workbench.colorTheme", opts.theme, nl);
  if (opts.icons) next = setScalar(next, "workbench.iconTheme", opts.icons, nl);

  if (bom + next === bom + text) return { status: "unchanged", color: opts.color, file };
  if (opts.dry) return { status: "dry", color: opts.color, file };

  fs.writeFileSync(file, bom + next);
  return { status: inserted ? "inserted" : "updated", color: opts.color, file };
}

/** Remove every key hue-shift manages. Returns { status, removed, file }. */
export function reset(dir, opts = {}) {
  const { file, exists, bom, text, nl } = readSettings(dir);
  if (!exists) return { status: "missing", removed: [], file };

  const range = findBlock(text, "workbench.colorCustomizations");
  if (!range) return { status: "clean", removed: [], file };

  const before = text.slice(range[0], range[1]);
  let obj;
  try {
    obj = parseJsonc(before);
  } catch {
    return { status: "error", removed: [], file, error: "could not parse colorCustomizations" };
  }

  const removed = MANAGED_KEYS.filter(
    (k) => k !== "peacock.color" && Object.prototype.hasOwnProperty.call(obj, k),
  );
  const writtenColors = new Set(removed.map((k) => String(obj[k]).slice(0, 7).toLowerCase()));

  // peacock.color is a root setting, not part of this block. Drop it only when
  // it still holds a colour we wrote; if Peacock set it independently, keep it.
  let dropPeacock = false;
  if (opts.withPeacock !== false) {
    try {
      const pc = parseJsonc(text)["peacock.color"];
      if (typeof pc === "string" && writtenColors.has(pc.slice(0, 7).toLowerCase())) {
        dropPeacock = true;
      }
    } catch {
      dropPeacock = false;
    }
  }

  for (const key of removed) delete obj[key];

  let next;
  if (Object.keys(obj).length === 0) {
    // Drop the whole key, including its line and any comma joining the neighbours.
    const keyAt = text.indexOf('"workbench.colorCustomizations"');
    const lineStart = text.lastIndexOf("\n", keyAt);
    const from = lineStart === -1 ? keyAt : lineStart;
    const headRaw = text.slice(0, from);
    let tail = text.slice(range[1]);
    // If another key follows, the comma before us now joins it to the key above.
    const hasFollowing = /^\s*"[^"]+"\s*:/.test(tail);
    const head = hasFollowing ? headRaw : headRaw.replace(/,\s*$/, "");
    if (hasFollowing) tail = tail.replace(/^\s*,/, "");
    next = (head + tail).replace(/\n[ \t]*\n/g, nl);
  } else {
    next = text.slice(0, range[0]) + render(obj, 2, nl) + text.slice(range[1]);
  }

  if (dropPeacock) next = removeKey(next, "peacock.color", nl);

  const allRemoved = dropPeacock ? [...removed, "peacock.color"] : removed;

  if (opts.dry) return { status: "dry", removed: allRemoved, file };
  if (next === text) return { status: "clean", removed: [], file };

  fs.writeFileSync(file, bom + next);
  return { status: "reset", removed: allRemoved, file };
}

/**
 * Compare what is on disk with what hue-shift would write.
 *
 * With opts.color set: full comparison, so drift is exact.
 * With opts.color null: validate-only mode. Confirms a colour exists and that
 * its foreground is readable. Used when no base colour is known, which happens
 * after --adjust, since the stored title bar colour is not the base colour.
 *
 * Returns { status: ok|drift|missing|invalid, diffs, warnings }.
 */
export function check(dir, opts) {
  const { exists, text } = readSettings(dir);
  if (!exists) {
    if (!opts.color) return { status: "missing", diffs: [], warnings: ["no .vscode/settings.json"] };
    return { status: "missing", diffs: Object.entries(buildCustomizations(opts)).map(([key, value]) => ({ key, expected: value, actual: null })) };
  }

  let parsed;
  try {
    parsed = parseJsonc(text);
  } catch (e) {
    return { status: "invalid", diffs: [], warnings: [e.message] };
  }

  const actual = parsed["workbench.colorCustomizations"] || {};

  if (!opts.color) {
    const bg = actual["titleBar.activeBackground"] || actual["activityBar.background"] || actual["statusBar.background"];
    if (!bg) return { status: "missing", diffs: [], warnings: ["no managed colour keys found"] };

    const fg = actual["titleBar.activeForeground"] || actual["activityBar.foreground"] || actual["statusBar.foreground"] || "#ffffff";
    const ratio = contrastRatio(bg, fg);
    const warnings = [];
    if (ratio !== null && ratio < 4.5) warnings.push(`contrast ${ratio.toFixed(2)} on ${bg} is below 4.5:1`);
    return { status: warnings.length ? "drift" : "ok", diffs: [], warnings, color: bg };
  }

  const expected = buildCustomizations(opts);
  const diffs = [];
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) diffs.push({ key, expected: value, actual: actual[key] ?? null });
  }
  // Stale managed keys left over from a previous --parts selection.
  for (const key of MANAGED_KEYS) {
    if (!(key in expected) && key in actual) {
      diffs.push({ key, expected: null, actual: actual[key] });
    }
  }

  return { status: diffs.length ? "drift" : "ok", diffs, warnings: [] };
}
