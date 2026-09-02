# homebridge-lutron-radiora3

Homebridge plugin (TypeScript) for Lutron RadioRA 3 processors, talking to the
processor over the LEAP protocol (`src/leap/`). Fork of `cyaneous/homebridge-lutron-radiora3`,
published as `@epthewizard/homebridge-lutron-radiora3` (scoped, public, on npm — see
"Publishing" in `README.md`).

Current feature set (all detailed in `README.md`, don't duplicate the explanations here):
keypad/Pico button presses (`SunnataKeypad.ts`/`PicoRemote.ts`), RA3 Virtual Button scenes as
momentary HomeKit switches (`VirtualButtonScene.ts`, opt-in via `options.virtualButtons`), and
direct two-way zone (switch/dimmer) control bypassing RA3's native HomeKit bridge
(`ZoneAccessory.ts`, opt-in via `options.zones`). Dimming is never added to a load that isn't
already physically dimmable — the plugin mirrors RA3's own zone capability, it doesn't invent one.

Both opt-in lists are configured via a live picker in the plugin's custom settings screen
(`homebridge-ui/`), not by typing names: `homebridge-ui/server.js`'s `/browse` endpoint opens
its own short-lived `LeapClient`+`Processor` connection (separate from the running plugin's
connection, same pattern as the existing `/connect` pairing endpoint) to fetch real virtual
button/zone names, and `homebridge-ui/public/index.html` renders them as checkboxes. If you add
a new opt-in-by-name config list in the future, wire it through this picker too rather than
adding another blind text field — that was explicitly the thing the user disliked.

Global instructions (`~/.codex/AGENTS.md`, symlinked from `~/.claude/CLAUDE.md`) apply on top of
this file and are canonical for cross-project rules (push/deploy policy, Serena/jCodeMunch/CodeGraph
tool usage, end-of-turn auto-commit). This file holds only what's specific to this repo.

## Build / lint / link
- `npm install` — plain install, no flags needed. `homebridge-config-ui-x` (devDependency,
  pulled in `node-pty-prebuilt-multiarch`'s native addon, which fails to build from source on
  newer Node/clang/gcc toolchains — verified failing on Node 24 both locally via Xcode clang and
  on the user's Unraid container via gcc) was removed from `devDependencies` entirely on
  2026-09-02: it was never imported anywhere in `src/`/`homebridge-ui/` (grep-confirmed), so it
  bought nothing for build/lint/test and only broke installs. This mattered beyond local dev:
  npm's git-dependency "prepare" step (`npm install <git-url>`, the only way to test unpublished
  changes before a version bump) force-installs *all* devDependencies in a temp clone to run
  `tsc`, so this native-addon failure broke `npm install <git-url>` for every user, not just
  local `npm install` here. If a devDependency ever needs `homebridge-config-ui-x` back (e.g. to
  manually test the Homebridge UI terminal), install it ad hoc (`npm install
  homebridge-config-ui-x --no-save`) rather than committing it to `package.json` again.
- `npm run build` — `rimraf dist && tsc`. `rootDir`/`include` in `tsconfig.json` is `src/` —
  any source file must live under `src/` or it's silently excluded from the build (see gotcha below).
- `npm run lint` — eslint over `src/**.ts`.
- `npm link` (in this repo) then `npm link @epthewizard/homebridge-lutron-radiora3` inside the
  Homebridge install directory, for local end-to-end testing against a real processor.
- Production installs go through the public npm registry now, not `npm link`/tarballs: bump
  version (`npm version patch`), `npm publish` (needs the user's own `npm login` — never run
  this without being asked, it's a real public publish). `publishConfig.access: "public"` in
  `package.json` is required for a scoped package to publish for free; don't remove it.
- User's confirmed Homebridge host: Unraid, official `homebridge/homebridge` Docker image
  (`hb-service` available, plugins under `/var/lib/homebridge/node_modules`, Node v24.20.0 in
  that container as of 2026-09). Homebridge UI's own **Terminal** tab gives a shell directly —
  no need for Unraid's separate Docker "Console"/`docker exec`. Reliable install/update
  regardless of npm search state: `hb-service add @epthewizard/homebridge-lutron-radiora3`
  (installs straight from the registry, restarts Homebridge automatically).
- **npm's search index lags the registry, confirmed directly** (queried
  `registry.npmjs.org/-/v1/search` ourselves): a freshly published/bumped scoped package can be
  `npm view`-able (and `hb-service add`-able) immediately while not showing up in Homebridge
  UI's Plugins search for hours. Not a bug in this repo — don't go looking for one if the user
  reports "it's not showing up in search" right after a publish; point them at `hb-service add`
  or `npm install <exact name>` instead, both of which hit the registry directly.

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

## Zone control: unverified command shape + duplicate-accessory risk
`Processor.setZoneLevel` sends `GoToLevel`/`Parameter:[{Type:'Level',Value:n}]` — the standard
LEAP command shape across Lutron integrations, but not yet confirmed against real RA3 hardware.
If a zone doesn't respond or reports wrong state, check `DEBUG='leap:*'` output for the actual
request/response before assuming the code is wrong. Also: `options.zones` is deliberately opt-in
per zone, not automatic, because RA3's native HomeKit bridge still exports every zone unless the
user manually disables that zone's HomeKit export in the Lutron app first — turning this on for
a zone that's still natively exported creates a duplicate HomeKit accessory. Don't change this
to an "expose everything" default without that caveat still holding.

## npmignore
`dist` was previously (wrongly) excluded from the npm package (a leftover from a generic
project template) — every publish would have shipped zero compiled code. Fixed. If `.npmignore`
is ever edited again, verify with `npm pack --dry-run` that `dist/*.js` is still included.
