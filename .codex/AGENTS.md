# homebridge-lutron-radiora3

Homebridge plugin (TypeScript) for Lutron RadioRA 3 processors, talking to the
processor over the LEAP protocol (`src/leap/`). Fork of `cyaneous/homebridge-lutron-radiora3`,
pushed to `epthewizard/homebridge-lutron-radiora3`.

Global instructions (`~/.codex/AGENTS.md`, symlinked from `~/.claude/CLAUDE.md`) apply on top of
this file and are canonical for cross-project rules (push/deploy policy, Serena/jCodeMunch/CodeGraph
tool usage, end-of-turn auto-commit). This file holds only what's specific to this repo.

## Build / lint / link
- `npm install` — devDependencies pull in `homebridge-config-ui-x`, which depends on
  `node-pty-prebuilt-multiarch` (native addon). It fails to build from source on newer
  Node/clang toolchains (verified failing on Node 24 / Xcode clang here). Since it's only
  needed to actually run `homebridge-config-ui-x`'s terminal feature, not to build/lint/test
  this plugin, use `npm install --ignore-scripts` when the plain install fails on that addon.
- `npm run build` — `rimraf dist && tsc`. `rootDir`/`include` in `tsconfig.json` is `src/` —
  any source file must live under `src/` or it's silently excluded from the build (see gotcha below).
- `npm run lint` — eslint over `src/**.ts`.
- `npm link` (in this repo) then `npm link homebridge-lutron-radiora3` inside the Homebridge
  install directory, for local end-to-end testing against a real processor.

## Known gotcha: case-sensitive imports
Dev happens on macOS (case-insensitive filesystem), but Homebridge typically runs on Linux
(case-sensitive) and npm publish preserves exact filenames — a lowercase import against a
PascalCase file (e.g. `./sunnataKeypad` importing `SunnataKeypad.ts`, `./buttonTracker`
importing `ButtonTracker.ts`) compiles and runs fine locally but breaks for every Linux user.
`tsconfig.json` has `forceConsistentCasingInFileNames: true` specifically to catch this at
compile time — do not remove it. If `tsc` ever complains about casing, fix the import, don't
suppress the flag.

## LEAP API robustness
RA3 firmware (confirmed on 26.05.26f000) omits `Body` entirely on `ReadRequest` responses for
areas that have no associated control station — earlier code assumed `Body` was always present
and threw `TypeError: Cannot read properties of undefined (reading 'ControlStations')`, aborting
discovery for that area. `Processor.getAreaControlStations` (`src/leap/Processor.ts`) now treats
a missing/unexpected body as "no control stations for this area" (returns `[]`) rather than
throwing, and also handles the singular `OneControlStationDefinition` shape. Apply the same
"absent body/field is a legitimate empty result, not an exception" pattern if similar
`TypeError`s show up in other `Processor.get*` methods against real RA3 hardware.
