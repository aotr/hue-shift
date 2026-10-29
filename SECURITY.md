# Security

## What this tool does with your files

`hue-shift` reads and writes `.vscode/settings.json` inside the project directories you point it at. It writes nothing else. It makes no network requests. It has no runtime dependencies, so there is no third-party code in the published package.

## Supported versions

The latest published version receives fixes. Older versions do not.

## Reporting a vulnerability

Please do not open a public issue.

Use GitHub's private reporting: **Security → Advisories → Report a vulnerability** at
https://github.com/aotr/hue-shift/security/advisories/new

Include what you did, what happened, and what an attacker could achieve. You can expect an acknowledgement within a few days.

## Out of scope

- A colour you find ugly.
- A `settings.json` that was already malformed before hue-shift touched it.
- Anything that requires an attacker to already have write access to your project.
