#!/usr/bin/env node
// hue-shift CLI entry point. Keep this file tiny: all logic lives in src/.

import { run } from "../src/cli.js";

try {
  const { code } = run(process.argv.slice(2));
  process.exitCode = code;
} catch (error) {
  if (error.usage) {
    console.error(`hue-shift: ${error.message}\n\nRun "hue-shift --help" for usage.`);
    process.exitCode = 1;
  } else {
    console.error(`hue-shift: ${error.message}`);
    process.exitCode = 2;
  }
}
