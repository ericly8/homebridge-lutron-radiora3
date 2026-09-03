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
button/zone names, and `homebridge-ui/public/index.html` renders them as checkboxes. This picker
is now the *only* settings screen — the old "Use legacy view" button (dropped into the raw
`config.schema.json` blind-array form) was removed entirely on 2026-09-03, so there's no
fallback UI to keep in sync anymore. If you add a new opt-in-by-name config list in the future,
wire it through this picker too rather than adding another blind text field — that was
explicitly the thing the user disliked.

**Any short-lived `LeapClient`/`Processor` opened in `homebridge-ui/server.js` (like `/browse`'s
or `/connect`'s) must be closed when done** (`client.close()` / `processor.close()`) and any
`client.connect()` call implicitly relies on `LeapClient`'s connect timeout
(`CONNECT_TIMEOUT_MS`, `src/leap/LeapClient.ts`). Both of these were bugs, not always-true
invariants: `doConnect` used to leak a live connection to the processor on every call (it fires
on every mDNS re-announce while Settings is open, not just once), and `connect()` used to have no
timeout at all — so once the leak exhausted the processor's connection slots, `/browse` would
hang forever with zero error/feedback, which is exactly what made the Scenes/zones picker look
totally broken on 2026-09-03. Fixed; keep both invariants (always close, always bounded by a
timeout) for anything added to this file going forward.

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
  **If `npm publish` fails with `E404 Not Found` on the PUT** (seen 2026-09-03), it's not a repo
  problem — that's the registry's response for an expired/dropped `npm login` session (or wrong
  account), not a real 404. Have the user check `npm whoami` (re-`npm login` if it's empty/wrong)
  and `npm config get registry` (should be `https://registry.npmjs.org/`) before assuming
  anything about the package/code is broken. The version bump from `npm version patch` still
  stands even if the following `npm publish` fails — don't bump again, just retry publish.
  Confirm what's actually live with `npm view @epthewizard/homebridge-lutron-radiora3 version`
  rather than assuming the last `npm version`/`npm publish` in chat history succeeded.
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

## Known gotcha: uninstalling the plugin wipes its pairing secrets
Uninstalling the plugin through Homebridge UI (or `hb-service remove`) removes its whole config
block from `config.json`, including the stored `secrets` (pairing cert/key/CA) — not just the
npm package. Reinstalling (from npm or git) afterward will show the processor as unpaired
("Associate" button in Settings) even if it was paired before; this is expected, not a bug — just
re-pair (Associate, then press the physical button on the processor within 30s). Confirmed live
2026-09-03: a processor that was fully paired and connecting fine went back to "unpaired" purely
because the plugin had been uninstalled/reinstalled to test a git build in between.

## Known gotcha: keypad button accessories are invisible in the Home app by design
`SunnataKeypad.ts` exposes each keypad button as a HomeKit `StatelessProgrammableSwitch` service
(see [[ra3_leap_discovery_fix]] discovery details) — Apple's Home app deliberately never renders
these as tiles, by design (they're automation triggers only: Home app → Automations → "An
Accessory is Controlled"). Seeing 30+ "Device X not found in accessory cache" log lines with
nothing appearing in the Home app afterward is *successful* keypad discovery, not a failure —
don't chase this as a bug. Virtual Button scenes and zones (`Switch`/`Lightbulb` services) are
the only accessory types from this plugin that show up as tappable tiles.

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
**Don't claim this is lower-latency than RA3's native bridge** — that was the original
motivating theory but it's unverified and the topology argues the other way: the native bridge
runs *on the processor itself* (one hop), while this plugin's path goes phone → Homebridge (a
separate host) → LEAP → processor (two hops). Whatever this feature is worth, it isn't proven
speed; don't repeat the claim without a real benchmark.

## npmignore
`dist` was previously (wrongly) excluded from the npm package (a leftover from a generic
project template) — every publish would have shipped zero compiled code. Fixed. If `.npmignore`
is ever edited again, verify with `npm pack --dry-run` that `dist/*.js` is still included.
**`package.json` now has an explicit `"files"` allowlist** (`dist`, `config.schema.json`,
`homebridge-ui`) as the real safeguard — added 2026-09-03 after discovering npm was reporting
"no .npmignore found" (despite one existing and being tracked) and shipping `.codex/AGENTS.md`,
`.serena/memories/*.md`, and (very nearly) a local `certs/` directory with real Lutron client
key material into the public package. `.npmignore`'s exclusions can't be trusted alone; the
`files` allowlist is what actually determines what gets published now — keep it in sync if new
top-level published paths are ever added, and never rely on ignore-file matching for anything
sensitive.

## Unresolved as of 2026-09-04: Scenes & Switches picker still empty after the leak/timeout fix
The connection-leak + missing-timeout bug (above) is fixed and confirmed live in `0.1.2`, but a
user with real hardware still sees "Connected!" with an empty Scenes & Switches section — no
error this time, just nothing found. Diagnostic logging was added to `doBrowse`
(`homebridge-ui/server.js`, commit `b312b25`) to log area/zone/virtual-button counts server-side,
but **that commit was not pushed to origin or published to npm before the session ended** — get
it shipped and get the log output before doing anything else on this bug. Full details, including
a real discovered wrinkle (the user's actual target button, "1st Floor Off", lives under a
Lutron-app "Smartphone" virtual-remote device, not obviously the same thing as a Designer Virtual
Button) are in [[ra3_picker_ui_and_npm_search_lag]] — read it before touching this again.

## Lesson: don't infer "what code is actually running" from version numbers alone
Confusion cost real time on 2026-09-03/04: `package.json`'s version field is not bumped by a git
install at all, and a user's own recollection of "I installed the fix" doesn't confirm which
commit they actually got. The only reliable checks: for an npm install, the version badge shown
on the plugin's card in Homebridge UI's Plugins list (not chat history, not `package.json` in
this dev checkout); for a git install, there's no reliable version signal at all — confirm via
what's actually on `origin/main` (`git log origin/main`) versus what's pushed locally.
