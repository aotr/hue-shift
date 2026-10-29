// Colour maths, named palette, and colour generation.
// Zero dependencies. Everything here is pure so it can be tested directly.

export const NAMED_COLORS = {
  amber: "#b45309",
  "angular-red": "#dd0531",
  "azure-blue": "#007fff",
  "burnt-orange": "#c2410c",
  crimson: "#9f1239",
  cyan: "#0e7490",
  green: "#15803d",
  "javascript-yellow": "#f9e64f",
  magenta: "#a21caf",
  "mandalorian-blue": "#1857a4",
  "node-green": "#215732",
  olive: "#4d7c0f",
  "peacock-blue": "#0f4c81",
  "react-blue": "#61dafb",
  rose: "#be123c",
  slate: "#334155",
  "svelte-orange": "#ff3d00",
  teal: "#0f766e",
  violet: "#6d28d9",
  "vue-green": "#42b883",
};

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Parse a hex string, a named colour, or a bare name into {r,g,b}.
 * Accepts #rgb, #rrggbb, #rrggbbaa (alpha dropped) and case-insensitive names.
 * Returns null when the value cannot be understood.
 */
export function parseColor(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();

  if (Object.prototype.hasOwnProperty.call(NAMED_COLORS, raw)) {
    return parseColor(NAMED_COLORS[raw]);
  }

  const match = raw.match(HEX_RE);
  if (!match) return null;

  const hex = match[1];
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const byte = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

export function toHex({ r, g, b }) {
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Normalise any accepted colour input to #rrggbb. Returns null if invalid. */
export function normalizeColor(value) {
  const rgb = parseColor(value);
  return rgb ? toHex(rgb) : null;
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;

  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
}

/** Move a colour towards white by pct (0-100). */
export function lighten(value, pct) {
  const rgb = parseColor(value);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  return hslToHex(h, s, clamp(l + pct, 0, 100));
}

/** Move a colour towards black by pct (0-100). */
export function darken(value, pct) {
  const rgb = parseColor(value);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  return hslToHex(h, s, clamp(l - pct, 0, 100));
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(value) {
  const rgb = parseColor(value);
  if (!rgb) return null;
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick whichever of white or black reads better on bg. */
export function readableForeground(bg) {
  const white = contrastRatio(bg, "#ffffff");
  const black = contrastRatio(bg, "#000000");
  if (white === null || black === null) return "#ffffff";
  return black > white ? "#000000" : "#ffffff";
}

/** Deterministic golden-angle hue walk: stable colours across runs. */
export function stableColor(index) {
  return hslToHex((index * 137.508) % 360, 62, 30);
}

/** Small seeded PRNG so --random --seed N reproduces exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MIN_HUE_GAP = 22;
export const SAT_RANGE = [55, 78];
export const LIGHT_RANGE = [25, 38];

const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Pick a random hue at least MIN_HUE_GAP from every hue in usedHues.
 * Pushes the chosen hue onto usedHues and returns a #rrggbb string.
 *
 * `total` is the number of colours this run needs. When the wheel can hold
 * them all (total <= 360 / MIN_HUE_GAP), hues are placed on a jittered even
 * grid, which guarantees the gap. Pure greedy placement cannot: it can cluster
 * early and run out of room even when a valid arrangement exists.
 *
 * Past that capacity the gap is impossible, so the most isolated arc wins.
 */
export function randomColor(usedHues, rng = Math.random, total = null) {
  const between = ([lo, hi]) => lo + rng() * (hi - lo);

  if (total && total > 0 && total <= Math.floor(360 / MIN_HUE_GAP)) {
    const sector = 360 / total;
    const jitter = rng() * Math.max(0, sector - MIN_HUE_GAP);
    const hue = (usedHues.length * sector + jitter) % 360;
    usedHues.push(hue);
    return hslToHex(hue, between(SAT_RANGE), between(LIGHT_RANGE));
  }

  let best = null;
  let bestGap = -1;

  for (let attempt = 0; attempt < 400; attempt++) {
    const hue = rng() * 360;
    const gap = usedHues.length ? Math.min(...usedHues.map((h) => hueDistance(h, hue))) : 360;
    if (gap >= MIN_HUE_GAP) {
      usedHues.push(hue);
      return hslToHex(hue, between(SAT_RANGE), between(LIGHT_RANGE));
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = hue;
    }
  }

  // Wheel is full: take the midpoint of the widest empty arc.
  if (usedHues.length) {
    const sorted = [...usedHues].sort((a, b) => a - b);
    let widest = -1;
    for (let i = 0; i < sorted.length; i++) {
      const from = sorted[i];
      const to = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
      if (to - from > widest) {
        widest = to - from;
        best = (from + (to - from) / 2) % 360;
      }
    }
  }

  usedHues.push(best);
  return hslToHex(best, between(SAT_RANGE), between(LIGHT_RANGE));
}

/** All named colours as {name, hex} sorted by name. */
export function listNamedColors() {
  return Object.keys(NAMED_COLORS)
    .sort()
    .map((name) => ({ name, hex: NAMED_COLORS[name] }));
}
