# Contributing to hue-shift

Thanks for taking the time. This is a small tool with a deliberately small surface, so the bar for a good contribution is clarity, not size.

## Ground rules

Three constraints keep the tool worth using. A pull request that breaks one of them will be asked to change:

1. **Zero runtime dependencies.** Only Node built-ins. If you reach for a package, the answer is usually twenty lines of standard library.
2. **No build step.** The published files are the source files. `npx` runs them directly.
3. **Node 18+.** No transpiling, no polyfills.

Beyond that: keep the diff small, match the surrounding style, and leave a test for anything with a branch or a loop.

## Setup

```bash
git clone https://github.com/aotr/hue-shift.git
cd hue-shift
npm test
```

There is nothing to install. Tests use the built-in `node:test` runner.

## Tests

```bash
npm test                      # everything
npm run test:watch            # re-run on change
node --test test/colors.test.js   # one file
node --test --test-name-pattern="contrast"   # one test
```

A test is worth writing when it would catch a real regression. The suite already covers:

- hex parsing, HSL round trips, WCAG contrast
- JSONC with comments, trailing commas, braces inside strings
- BOM and CRLF preservation
- merging colour keys hue-shift does not own
- reset idempotence
- every CLI flag and exit code

If you fix a bug, add the failing case first.

## Project layout

```
bin/hue-shift.js   entry point, argument hand-off, exit codes
src/colors.js      colour maths, palette, seeded random
src/settings.js    JSONC read / merge / write / reset / check
src/cli.js         argument parsing, config resolution, output
test/              node:test suites, one per module
docs/              the GitHub Pages site (static, no build)
examples/          runnable shell scripts
```

`src/settings.js` is the delicate one. It edits files people care about, so any change there needs a test for the exact case you are touching, plus one for the file still being valid JSON afterwards.

## Adding a named colour

Edit `NAMED_COLORS` in `src/colors.js`:

```js
export const NAMED_COLORS = {
  // ...
  "your-colour": "#rrggbb",
};
```

Then:

```bash
npm test
npx hue-shift-cli --list-colors
```

The suite checks that every named colour reaches at least 4.5:1 contrast with the foreground hue-shift picks for it. If yours fails, darken it until it passes — a colour you cannot read text on is not useful.

## Commits

Conventional Commits, one idea per commit:

```
feat(colors): add a teal-shift named colour
fix(reset): keep peacock.color when Peacock owns it
docs: correct the benchmark
test(settings): cover CRLF with a BOM
```

Explain *why* in the body when the change is not obvious from the diff. The diff already says what changed.

## Pull requests

Before opening one:

- [ ] `npm test` passes on your machine
- [ ] new behaviour has a test
- [ ] `README.md` updated if a flag, config key, or limit changed
- [ ] no new dependencies
- [ ] no formatting-only churn in unrelated files

Small pull requests get reviewed fastest. If you are planning something large, open an issue first so we can agree on the shape before you write it.

## Reporting a bug

Open an issue with:

- what you ran, and the full output
- your `hue-shift --version`, Node version, and OS
- the relevant `settings.json` (redact anything private)
- what you expected instead

A reproduction in a throwaway directory is worth more than a long description:

```bash
mkdir /tmp/repro && cd /tmp/repro
npx hue-shift-cli . --color amber
cat .vscode/settings.json
```

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Code of conduct

Be decent. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
