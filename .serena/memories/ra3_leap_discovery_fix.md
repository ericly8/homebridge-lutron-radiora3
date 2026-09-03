# RA3 area discovery crash fix (2026-09-01)

Fork of cyaneous/homebridge-lutron-radiora3, forked to epthewizard/homebridge-lutron-radiora3.
Homebridge plugin talking to Lutron RadioRA 3 processors over LEAP (`src/leap/`).

## Package renamed to avoid npm-registry collision
npm's `homebridge-lutron-radiora3` (unscoped) is cyaneous's real upstream package. To stop
Homebridge UI's "Update" (or a bare `npm install`) from silently pulling that in and
overwriting this fork, `package.json` `name` and `src/settings.ts`'s `PLUGIN_NAME` were both
changed to `@epthewizard/homebridge-lutron-radiora3` (scoped). `PLATFORM_NAME` (`LutronRadioRA3`,
the `pluginAlias` in `config.schema.json` and the `"platform"` key in a user's `config.json`)
was deliberately left unchanged, so existing platform config/secrets don't need to be touched —
only the plugin/package identity changed. Accessories are keyed by package name though, so
migrating an existing install requires clearing `cachedAccessories` (see README "Known gotchas").
`npm link` must be redone under the new scoped name after this rename.

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

## Build environment note (fixed 2026-09-02, was previously a workaround)
`homebridge-config-ui-x` (devDependency, pulled in `node-pty-prebuilt-multiarch`'s native
addon, which failed to build from source on Node 24 / newer clang or gcc) was **removed from
`devDependencies` entirely** — grep confirmed it was never imported anywhere in
`src/`/`homebridge-ui/`, so it bought nothing for build/lint/test. This wasn't just a local-dev
annoyance: npm's git-dependency "prepare" step (`npm install <git-url>`, needed to test
unpublished changes) force-installs *all* devDependencies in a temp clone to run `tsc`, so this
one broken native addon broke `npm install <git-url>` for every user trying to test pre-release
code — surfaced live 2026-09-02 when the user tried it on their Unraid Homebridge container.
Plain `npm install` now works with no flags; the old `--ignore-scripts` workaround is no longer
needed (and would have skipped the `prepare`/`tsc` build step too, which git installs need).

## Keypad button accessories don't show as tiles in Apple Home — this is by design
`SunnataKeypad.ts` exposes each button as a `StatelessProgrammableSwitch` service. Apple's Home
app deliberately never renders that service type as a tile — it's automation-trigger-only (Home
app → Automations → "An Accessory is Controlled"). Confirmed live 2026-09-02/03: a user seeing
30+ "Device X not found in accessory cache" log lines (successful discovery of that many keypad
devices) followed by nothing appearing in the Home app was not a bug — that's expected behavior
for this accessory type. Only [[ra3_virtual_button_scenes]] (`Switch`) and [[ra3_zone_control]]
(`Switch`/`Lightbulb`) produce tappable tiles.

## Local testing
`npm run build` (tsc) and `npm run lint` (eslint) both pass clean after the above fixes.
`npm link` done in this repo under the new scoped name; still need
`npm link @epthewizard/homebridge-lutron-radiora3` inside the Homebridge install directory to
consume it there.

See also: project `.codex/AGENTS.md` (symlinked from `CLAUDE.md`) and `README.md` have the same
gotchas in durable-instruction / user-facing form.
