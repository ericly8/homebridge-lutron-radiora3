# RA3 area discovery crash fix (2026-09-01)

Fork of cyaneous/homebridge-lutron-radiora3, forked to epthewizard/homebridge-lutron-radiora3.
Homebridge plugin talking to Lutron RadioRA 3 processors over LEAP (`src/leap/`).

## Bug fixed: TypeError on ControlStations during discovery
On RA3 firmware 26.05.26f000, `ReadRequest` to `/area/<id>/associatedcontrolstation` omits
`Body` entirely for areas with no associated control station. `Processor.getAreaControlStations`
(`src/leap/Processor.ts`) previously cast `raw.Body!` unconditionally and threw
`TypeError: Cannot read properties of undefined (reading 'ControlStations')`, which
`discoverDevices` in `src/platform.ts` caught per-area and skipped — so keypads living in those
"no control station" areas were silently missing from discovery. Fixed to return `[]` when
`Body` is absent, and to also accept the singular `OneControlStationDefinition` shape
(`{ ControlStation }`) in addition to `MultipleControlStationDefinition` (`{ ControlStations }`).
If similar `TypeError`s appear against real RA3 hardware for other `Processor.get*` methods,
apply the same "missing field = empty result" pattern rather than throwing.

## Bug fixed: case-sensitive import paths (build-breaking + Linux runtime-breaking)
A prior commit (`b198de9`, "filename caps fix") renamed `src/SunnataKeypad.ts` to a root-level
`sunnataKeypad.ts` — outside `src/`, which `tsconfig.json`'s `rootDir`/`include: ["src/"]`
excludes from the build entirely, so `tsc` could not resolve `platform.ts`'s
`import { SunnataKeypad } from './sunnataKeypad'`. Moved back to `src/SunnataKeypad.ts`.
Also found and fixed matching lowercase-vs-PascalCase import mismatches that only "work" on
macOS's case-insensitive filesystem and would break on Linux (most real Homebridge hosts) and
npm-published tarballs: `./sunnataKeypad`/`./picoRemote` in `platform.ts`, `./buttonTracker` in
both `SunnataKeypad.ts` and `PicoRemote.ts` — actual files are `SunnataKeypad.ts`,
`PicoRemote.ts`, `ButtonTracker.ts`. Added `forceConsistentCasingInFileNames: true` to
`tsconfig.json` so `tsc` catches this class of bug at compile time going forward — don't remove it.

## Build environment note
`npm install` fails building `node-pty-prebuilt-multiarch` (transitive dep of
devDependency `homebridge-config-ui-x`) from source on Node 24 / newer clang. Use
`npm install --ignore-scripts` — not needed to build/lint/test the plugin itself, only to run
`homebridge-config-ui-x`'s terminal feature.

## Local testing
`npm run build` (tsc) and `npm run lint` (eslint) both pass clean after the above fixes.
`npm link` done in this repo; still need `npm link homebridge-lutron-radiora3` inside the
Homebridge install directory to consume it there.

See also: project `.codex/AGENTS.md` (symlinked from `CLAUDE.md`) has the same gotchas in
durable-instruction form.
