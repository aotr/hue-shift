import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NAMED_COLORS,
  parseColor,
  toHex,
  normalizeColor,
  rgbToHsl,
  hslToHex,
  lighten,
  darken,
  relativeLuminance,
  contrastRatio,
  readableForeground,
  stableColor,
  mulberry32,
  randomColor,
  listNamedColors,
  MIN_HUE_GAP,
} from "../src/colors.js";

test("parseColor reads 6-digit hex", () => {
  assert.deepEqual(parseColor("#b45309"), { r: 180, g: 83, b: 9 });
  assert.deepEqual(parseColor("b45309"), { r: 180, g: 83, b: 9 });
  assert.deepEqual(parseColor("#B45309"), { r: 180, g: 83, b: 9 });
});

test("parseColor expands 3-digit hex", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("#0a0"), { r: 0, g: 170, b: 0 });
});

test("parseColor drops alpha from 8-digit hex", () => {
  assert.deepEqual(parseColor("#b45309cc"), { r: 180, g: 83, b: 9 });
});

test("parseColor resolves named colours", () => {
  assert.deepEqual(parseColor("amber"), parseColor(NAMED_COLORS.amber));
  assert.deepEqual(parseColor("PEACOCK-BLUE"), parseColor("#0f4c81"));
});

test("parseColor rejects junk", () => {
  for (const bad of ["", "nope", "#12345", "#gggggg", "rgb(1,2,3)", null, 42]) {
    assert.equal(parseColor(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("normalizeColor returns #rrggbb or null", () => {
  assert.equal(normalizeColor("#FFF"), "#ffffff");
  assert.equal(normalizeColor("teal"), "#0f766e");
  assert.equal(normalizeColor("nope"), null);
});

test("toHex pads each channel", () => {
  assert.equal(toHex({ r: 0, g: 0, b: 0 }), "#000000");
  assert.equal(toHex({ r: 1, g: 2, b: 3 }), "#010203");
  assert.equal(toHex({ r: 300, g: -5, b: 255.6 }), "#ff00ff");
});

test("rgbToHsl and hslToHex round trip", () => {
  for (const hex of ["#b45309", "#0f766e", "#ffffff", "#000000", "#61dafb"]) {
    const hsl = rgbToHsl(parseColor(hex));
    assert.equal(hslToHex(hsl.h, hsl.s, hsl.l), hex, `round trip failed for ${hex}`);
  }
});

test("lighten and darken move towards white and black", () => {
  assert.equal(lighten("#000000", 50), "#808080");
  assert.equal(darken("#ffffff", 50), "#808080");
  assert.equal(lighten("#ffffff", 50), "#ffffff", "cannot get lighter than white");
  assert.equal(darken("#000000", 50), "#000000", "cannot get darker than black");
  assert.equal(lighten("nope", 10), null);
  assert.equal(darken("nope", 10), null);
});

test("relativeLuminance hits the extremes", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
});

test("contrastRatio knows black on white is 21:1", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(4), "21.0000");
  assert.equal(contrastRatio("#ffffff", "#ffffff").toFixed(4), "1.0000");
  assert.equal(contrastRatio("nope", "#fff"), null);
  // Symmetric.
  assert.equal(contrastRatio("#b45309", "#ffffff"), contrastRatio("#ffffff", "#b45309"));
});

test("readableForeground picks the higher-contrast text colour", () => {
  assert.equal(readableForeground("#ffffff"), "#000000");
  assert.equal(readableForeground("#000000"), "#ffffff");
  assert.equal(readableForeground("#b45309"), "#ffffff");
  assert.equal(readableForeground("#f9e64f"), "#000000");
});

test("every named colour is readable with its auto foreground", () => {
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    const fg = readableForeground(hex);
    const ratio = contrastRatio(hex, fg);
    assert.ok(ratio >= 4.5, `${name} (${hex}) only reaches ${ratio.toFixed(2)}:1`);
  }
});

test("stableColor is deterministic and spread out", () => {
  assert.equal(stableColor(0), stableColor(0));
  assert.notEqual(stableColor(0), stableColor(1));
  const seen = new Set(Array.from({ length: 12 }, (_, i) => stableColor(i)));
  assert.equal(seen.size, 12, "no duplicate colours in the first 12");
});

test("mulberry32 reproduces the same stream for the same seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test("randomColor guarantees the hue gap up to wheel capacity", () => {
  // 360 / 22 = 16 colours fit with the gap intact.
  for (const total of [3, 8, 12, 16]) {
    const used = [];
    for (let i = 0; i < total; i++) {
      const hex = randomColor(used, Math.random, total);
      assert.match(hex, /^#[0-9a-f]{6}$/);
    }
    // `used` holds the exact hues chosen, so no hex round-trip noise.
    for (let i = 0; i < used.length; i++) {
      for (let j = i + 1; j < used.length; j++) {
        const d = Math.abs(used[i] - used[j]) % 360;
        const gap = d > 180 ? 360 - d : d;
        assert.ok(gap >= MIN_HUE_GAP, `total=${total}: hues ${i} and ${j} only ${gap.toFixed(1)} apart`);
      }
    }
  }
});

test("randomColor still spreads hues beyond wheel capacity", () => {
  const used = [];
  for (let i = 0; i < 40; i++) randomColor(used, Math.random, 40);
  assert.equal(new Set(used.map((h) => Math.round(h))).size, 40, "40 projects, 40 distinct hues");
});

test("randomColor is reproducible with a seeded rng", () => {
  const run = () => {
    const used = [];
    const rng = mulberry32(7);
    return Array.from({ length: 6 }, () => randomColor(used, rng));
  };
  assert.deepEqual(run(), run());
});

test("randomColor still returns a colour when the wheel is crowded", () => {
  const used = Array.from({ length: 40 }, (_, i) => i * 9);
  assert.match(randomColor(used), /^#[0-9a-f]{6}$/);
});

test("randomColor stays in the readable lightness band", () => {
  const used = [];
  for (let i = 0; i < 30; i++) {
    const { l } = rgbToHsl(parseColor(randomColor(used)));
    assert.ok(l >= 22 && l <= 42, `lightness ${l.toFixed(1)} outside band`);
  }
});

test("listNamedColors is sorted and complete", () => {
  const list = listNamedColors();
  assert.equal(list.length, Object.keys(NAMED_COLORS).length);
  const names = list.map((c) => c.name);
  assert.deepEqual(names, [...names].sort());
});
