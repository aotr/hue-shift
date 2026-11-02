# Locked palette

**Status:** approved
**Date:** 2026-11-02
**Package version at time of writing:** 1.1.0

## Problem

`--random --seed N` is only reproducible for an identical set of folders. Adding one folder changes `total`, which changes the sector size for every project, so every colour moves:

```
3 projects:  a #989620  b #217881  c #561c9d
add "aa":    a #987220  aa #21813a  b #1c759d  c #952591
```

This contradicts the "colours that stay put" workflow in the README, and it makes `--check` fail for projects nobody touched whenever a folder is added.

## Goal

A bulk run assigns each project a colour once and keeps it. Adding, removing, or renaming a folder never recolours an existing project. The palette is reviewable, portable, and usable by `--check` in CI.

## Non-goals

- Single-project runs. Pin those with `.hue-shift.json` instead.
- `--prune` or `--reroll` flags.
- `.code-workspace` support.
- Changes to the colour maths or the named palette.
- Migrating colours that were applied before this feature shipped.

## Behaviour

### Scope

Only `--root` runs read or write a lock. `hue-shift <project>` is unchanged and ignores any lock. There is one lock per root, at `<root>/hue-shift.lock.json`.

### Precedence when applying

For each target in a bulk run:

1. CLI `--color` (a single colour applied to every target)
2. `color` from the project's `.hue-shift.json`
3. the existing lock entry
4. a generated colour

The effective colour is written back to the lock for every target, so the lock records the intended palette rather than only generated history. Running `--color teal --root .` therefore pins teal for all targets in the lock.

### Generating new entries

- **No lock yet:** behaviour is unchanged. `--random` uses the jittered grid for up to 16 projects and the most-isolated-arc path beyond that. Default mode uses `stableColor(index)`.
- **Lock exists:** existing entries are reused verbatim. New entries are generated with the locked hues pre-seeded, using the most-isolated-arc path only. The grid is not used, because locked hues are not grid-aligned and the grid could place a new colour within 22° of one.
- `--seed` only affects the generator for new entries. Changing the seed never recolours a locked project.

### Check

- With no lock file and no explicit colour: today's validate-only behaviour.
- With a lock file and a colour known from it or from explicit config: exact comparison through `buildCustomizations`, as `--check --color` does today.
- When a lock file exists but a target has no entry, the target reports `missing` (exit 2). CI should notice an uncoloured project.
- A lock entry for a folder that no longer exists is ignored.
- `--check` never writes the lock.

### Dry, reset, restore

- `--dry` computes and prints the same plan as a real run, but writes neither settings nor the lock.
- `--reset` and `--restore` neither read nor write the lock. A malformed lock must not block cleanup.

### Removed and renamed folders

Entries for folders that no longer exist stay in the file. A folder renamed back gets its old colour. There is no pruning.

## File format

```json
{
  "version": 1,
  "projects": {
    "alpha": "#989620",
    "beta": "#217881"
  }
}
```

- `projects` keys are folder basenames. One lock per root keeps them unique.
- Values are lowercase `#rrggbb`, validated with the existing `normalizeColor`.
- Keys are sorted lexicographically.
- Two-space indent and a trailing newline.
- Strict JSON: no comments and no trailing commas. Users may hand-edit it, but the tool only writes strict JSON.
- The file is written atomically: write a temporary file in the same directory, then rename it over the lock.
- A missing file means an empty palette.

### Invalid lock

The run aborts before touching any settings when the lock:

- is not valid JSON,
- has a `version` other than `1`,
- has no `projects` object, or
- has a `projects` value that is not a valid colour.

The error names the file and the reason. It is thrown as a plain `Error`, so `bin/hue-shift.js` exits 2. The palette is never silently reset.

## Code changes

### New `src/lock.js`

- `LOCK_FILE = "hue-shift.lock.json"`
- `lockPath(root)`
- `readLock(root)` → `{ version: 1, projects: {} }` when missing; throws on invalid content
- `writeLock(root, projects)` → sorts, validates, writes atomically

No assignment helper in this module. The CLI already owns the target loop and is the only caller; a separate abstraction would have one implementation.

### `src/cli.js`

- `resolveTargets` adds a `root` field to each target: the resolved root directory for `--root` targets, `null` for positional and current-directory targets. Existing fields are unchanged.
- In the bulk path, group targets by `root`, read each lock once, and resolve colours using the precedence above.
- Write every lock once, before the apply loop. If a lock write fails, no settings are touched.
- Pass the resolved colour into `resolveOptions` and `check` as today.
- `--dry` skips the lock write.
- `--reset`, `--restore`, `--help`, `--version`, and `--list-colors` skip lock handling entirely.

### Unchanged

`src/colors.js` and `src/settings.js`. The lock uses their existing `parseColor`/`normalizeColor` and `rgbToHsl` exports.

## Tests

### `test/lock.test.js` (new)

1. A missing file reads as an empty palette.
2. A valid file is parsed.
3. Bad JSON, wrong version, missing `projects`, and an invalid colour each throw with the file path.
4. `writeLock` sorts keys, uses two-space indent, and ends with a newline.
5. `writeLock` replaces an existing file and leaves no temporary file behind.
6. An empty palette writes `{"projects": {}}` with a version.

### `test/cli.test.js` (additions)

1. The first bulk `--random` run creates a lock containing every target.
2. Adding a folder leaves the existing colours unchanged and appends one entry.
3. Deleting a folder leaves its entry in the lock.
4. A bulk `--color` run records that colour for every target.
5. `--check` passes against the lock after a clean apply.
6. `--check` reports `missing` for a folder absent from the lock, and exits 2.
7. `--dry` creates no lock.
8. `--reset` leaves the lock unchanged.
9. A single-project run neither creates nor reads a lock.
10. A malformed lock aborts before settings are written, and `--reset` still works.

The existing `--seed makes --random reproducible` test must keep passing; it now passes through the lock rather than regenerating.

## Docs

- README: new "Locked palette" subsection under "Real workflow", explaining the file, that it should be committed when the root is a git repository, and that deleting it re-rolls the palette.
- README commands table: note that `--random` in `--root` mode assigns only new projects.
- README FAQ: "How do I re-roll all colours?" → delete `hue-shift.lock.json`.
- `docs/cli.html`: add the lock explanation next to the bulk options if the page has a relevant section.

## Release

Feature release: minor version bump to 1.2.0 at publish time. No changelog file exists, so the GitHub release notes carry the description.

## Open questions

None.
