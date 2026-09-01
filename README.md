# @epthewizard/homebridge-lutron-radiora3

## TL;DR — what this is, and how to check it's working right now

This is a Homebridge plugin that talks directly to your Lutron RadioRA 3 processor and adds
three things HomeKit doesn't otherwise get from RA3: (1) **keypad/Pico remote button presses**
as HomeKit accessories, (2) **fast whole-house scenes** (one tap instead of Apple Home's
slow one-device-at-a-time Scenes), and (3) **direct, faster control of individual switches/
dimmers** for the ones you opt in, instead of RA3's own built-in HomeKit bridge. None of this
needs the internet to run day-to-day — it's a local plugin talking to a local processor over
your LAN. The only step that ever needed internet was `npm publish`/installing it once via
Homebridge UI's plugin search.

**To check whether it's actually installed and working right now:**
1. Open Homebridge UI (whatever URL/port you use on your Unraid box) in a browser — this is a
   page served by your own Homebridge container, so it works even with your internet down.
2. **Plugins** tab → look for `@epthewizard/homebridge-lutron-radiora3` in your installed list.
   If it's there, it installed successfully.
3. Click **Settings** on its card → this should open a custom pairing screen (not a plain form)
   → if you haven't paired yet, follow "Pairing with the processor" below.
4. **Logs** tab (or `Homebridge Logs` in the UI) → look for lines starting `[Lutron RadioRA 3]`.
   `Processor <id> is running firmware ...` means it found and connected to your processor.
   `Device ... not found in accessory cache` / `Found a Sunnata...` lines mean it's discovering
   your keypads. Errors here are the fastest way to tell what's actually wrong.
5. In the Home app, look for new accessories named after your keypads/Picos — those only show
   up once discovery in step 4 succeeds.

If nothing shows up in step 2, the plugin never actually got installed (see "Publishing" below
for the install steps) — that's the most common reason "I did it all" and "nothing's happening"
coexist: the `npm publish` half and the "install it onto this specific Homebridge instance"
half are two separate steps.

---

Homebridge plugin for **Lutron RadioRA 3** processors (LEAP protocol). Confirmed working
against firmware `26.05.26f000`. The platform explicitly checks `DeviceType ===
'RadioRa3Processor'` and `ProductType === 'Lutron RadioRA 3 Project'` on startup and refuses
to run against anything else (RA2, Caseta) — this is not a generic Lutron plugin.

`homebridge-lutron-radiora3` (unscoped) on npm is cyaneous's real upstream package — this fork
is published separately as `@epthewizard/homebridge-lutron-radiora3` (scoped) so it shows up
in Homebridge UI's plugin search under its own identity and can never be confused with, or
silently overwritten by, the original via "Update".

Supports:
* Sunnata Keypads / Sunnata Hybrid Keypads → HomeKit Stateless Programmable Switches (single/double/long press per button)
* Pico remotes (untested on real hardware beyond basic cases)
* RA3 Virtual Buttons (scenes) → HomeKit momentary switches, opt-in (see below)
* Direct switch/dimmer (zone) control → HomeKit Switch/Lightbulb, opt-in, bypassing RA3's
  native HomeKit bridge (see below)

Shades and fans aren't implemented yet. Switches/dimmers are only controlled directly when you
opt a zone in via `options.zones` — otherwise RA3's Smart Bridge keeps exposing them to HomeKit
natively, same as always.

Based on [lutron-leap-js](https://github.com/thenewwazoo/lutron-leap-js) and
[homebridge-lutron-caseta-leap](https://github.com/thenewwazoo/homebridge-lutron-caseta-leap/).

## Requirements

- Node matching what your Homebridge host actually runs — Homebridge 1.7 wants Node `^18.15.0`
  or `^20.7.0`; a much newer Node (e.g. 22+/24) will still build this plugin but Homebridge
  itself will warn/misbehave, so use whatever Node your Homebridge install uses.
- Homebridge `>=1.6.0`.
- Your RA3 processor and the Homebridge host on the same network segment (mDNS/`_lutron._tcp`
  discovery + a direct TLS connection to the processor on port 8081).

## Dev testing setup (this checkout)

`npm link` below is for iterating locally before you publish an update — see "Publishing
(production deployment)" further down for how it actually gets onto a real Homebridge install.

```bash
git clone git@github.com:epthewizard/homebridge-lutron-radiora3.git
cd homebridge-lutron-radiora3

# homebridge-config-ui-x pulls in node-pty, a native addon that fails to build from
# source on newer Node/clang toolchains. It's only needed for the UI's terminal
# feature, not for building/running this plugin, so skip its install scripts:
npm install --ignore-scripts

npm run build      # rimraf dist && tsc
npm run lint        # eslint

npm link             # registers this checkout as the global `@epthewizard/homebridge-lutron-radiora3` package
```

Then, inside your Homebridge install directory (wherever its own `package.json`/`node_modules` live):

```bash
npm link @epthewizard/homebridge-lutron-radiora3
```

> If you previously had cyaneous's `homebridge-lutron-radiora3` (unscoped) installed, remove it
> first (`npm uninstall homebridge-lutron-radiora3` in the Homebridge dir) — otherwise you'll
> have both plugins loaded and registering the same devices.

Restart Homebridge. Useful while iterating:

```bash
# clear cached accessories if you've changed how devices/services are modeled
rm ~/.homebridge/accessories/cachedAccessories

# build + link + auto-restart on change, with LEAP/HAP debug logging
DEBUG='leap:*,HAP-NodeJS:Accessory' npm run watch
```

Every source change requires `npm run build` (or `npm run watch`) — the linked `dist/` is
what Homebridge actually loads, not the TypeScript source.

## Pairing with the processor

Pairing/config happens through the plugin's custom Homebridge UI settings screen
(`homebridge-ui/`), not by hand-editing `config.json`:

1. Open the plugin's settings in Homebridge UI → it mDNS-discovers processors on the network.
2. Select your processor and press the physical pairing button on the RA3 processor when
   prompted (30s window) — this is the same association flow as pairing the Lutron app.
3. The UI generates an RSA keypair, submits a CSR to the processor, and receives back a signed
   cert + CA. These get stored as a `secrets` entry (`processorID`, `ca`, `key`, `cert`) in
   the plugin config — keep `config.json` private, these are real client certs for your processor.

Multiple processors are supported — just repeat pairing for each; each gets its own `secrets` entry.

## Scenes (Virtual Buttons) — fast, multi-device HomeKit "buttons"

Apple Home Scenes are composed client-side: tapping one sends a separate HAP write to every
accessory in the scene, one at a time — slow and visibly sequential with more than a couple
of devices. RA3 Virtual Buttons avoid that entirely: each one triggers a Preset (a scene
defined *on the processor*) with a single LEAP command, and the processor fires every
affected zone over its own bus at once — the same mechanism a physical keypad scene button
uses. Use these instead of Apple Home Scenes for anything multi-device.

This is not limited to keypad-associated loads — a Preset can affect any dimmer, switch, or
shade in the whole RA3 project, including ones exposed to HomeKit natively by the Smart Bridge.
So if RA3's *native* HomeKit bridge feels slow when you fire a multi-device Apple Home Scene
against those, the fix is the same: define the change as a Preset/Virtual Button in Lutron,
expose that one virtual button here, and trigger it (directly or via automation) instead of
the Apple Home Scene.

Setup:
1. In the Lutron app (or Designer), create/name the Virtual Buttons you want (each tied to a
   Preset/scene) — this plugin doesn't create them, only exposes existing ones.
2. In this plugin's config, add the Virtual Button's exact name to `options.virtualButtons`
   (Homebridge UI: "Virtual Buttons (scenes) to expose"). Nothing is exposed by default —
   this is opt-in, so internal/programming-only virtual buttons in your project don't clutter
   the Home app.
3. Restart Homebridge. Each configured name shows up as a HomeKit switch; tapping it fires the
   scene, and the switch flips back off ~1s later (it's momentary, not persistent state).
4. These are ordinary HomeKit switches, so they also work as triggers inside Home app/Shortcuts
   automations — just don't put more than one in the same Apple Home *Scene*, or you're back to
   the slow sequential behavior this is meant to avoid.

## Direct switch/dimmer control (bypassing RA3's native HomeKit bridge)

If a single switch or dimmer feels slow in HomeKit, that's not this plugin, and it never was —
dimmers/switches are exposed to HomeKit by the Smart Bridge's own built-in bridge, a completely
separate code path this plugin has no part in. This feature makes this plugin control the zone
directly instead: a HomeKit `Switch` (or `Lightbulb`, for dimmable loads) backed by LEAP
commands over the same persistent local connection keypad buttons already use.

**This is opt-in per zone, and it has a real gotcha**: if you add a zone here while RA3's native
bridge is still also exposing it, the same physical switch shows up **twice** in the Home app,
with two independently-drifting states. Before adding a zone to `options.zones`, go disable that
zone's HomeKit export in the Lutron app first.

Setup:
1. In the Lutron app, find the zone (switch/dimmer) you want and turn off its HomeKit export.
2. Add the zone's exact name to `options.zones` in this plugin's config (Homebridge UI: "Zones
   to control directly"). Nothing is touched by default — opt-in, one zone at a time.
3. Restart Homebridge. It auto-detects dimmable zones (`Lightbulb` with a brightness slider) vs.
   plain on/off zones (`Switch`) from the zone's own definition — nothing to configure per-type.
4. State changes made physically (at the switch/keypad) or from another app are reflected back
   into HomeKit live, via the same LEAP subscription mechanism keypad button presses use — this
   isn't a one-way remote, it's full two-way control.

This is new and only exercised against firmware `26.05.26f000` so far — if a zone doesn't
respond, or reports the wrong on/off or brightness state, check Homebridge's debug log
(`DEBUG='leap:*' `) for the exact LEAP command/response and file a note; the `GoToLevel` command
shape this uses is the standard one across Lutron's LEAP protocol, but hasn't been verified
against every RA3 zone/device type (shades and fans aren't handled by this yet at all).

## Publishing (production deployment)

This fork is published to the public npm registry as `@epthewizard/homebridge-lutron-radiora3`,
which is what makes it installable the normal way — Homebridge UI's Plugins search, on any
Homebridge install (Docker, Unraid, Pi, whatever), no shell access needed.

**First publish / publishing an update** — from this checkout, on your dev machine:

```bash
npm login                 # one-time; opens a browser to authorize this machine to your npm account
npm version patch         # bumps package.json's version (or `minor`/`major`) — npm refuses to
                           # republish an already-published version number
npm publish               # runs prepublishOnly (lint + build) automatically, then publishes
```

`npm login`/`npm publish` need *your* npm credentials — this is not something that can be
scripted or done on your behalf, run it yourself in a terminal.

**Installing on Homebridge (any host, including Unraid Docker)** — in Homebridge UI:

1. Plugins tab → search `homebridge-lutron-radiora3` (or `epthewizard`).
2. Find `@epthewizard/homebridge-lutron-radiora3` in the results and click Install.
3. Restart Homebridge.
4. Configure it: click Settings on the plugin card → this opens the custom pairing UI (see
   "Pairing with the processor" above) → discover your processor → press its physical pairing
   button → save.

That's it — no `npm link`, no container shell, no tarballs. Future updates are the same UI's
Update button, since it's now a real published package under a name only you own.

### Unraid specifically

The Homebridge container (whether the `oznu/homebridge` or `homebridge/homebridge` Community
App) already runs Homebridge UI on the port you set up during the Unraid template install —
open that in a browser and follow the 4 steps above exactly as you would on any other host.
You never need Unraid's Docker "Console" button or `docker exec` for this — that's only a
fallback for plugins that aren't published, which this no longer is.

## Known gotchas

- **Case-sensitive imports**: dev happens on macOS (case-insensitive FS); Homebridge usually
  runs on Linux (case-sensitive). `tsconfig.json` has `forceConsistentCasingInFileNames: true`
  specifically to catch mismatched import casing at compile time — don't remove it, and don't
  add a new source file whose import casing doesn't match its filename exactly.
- **RA3 firmware omits `Body` on some LEAP responses** — e.g. `/area/<id>/associatedcontrolstation`
  returns no body at all for areas with no control station. `Processor.get*` methods treat a
  missing/unexpected body as "empty result," not an error; keep that pattern if you add new
  LEAP calls, since firmware behavior here isn't fully documented by Lutron.
- `npm install` (without `--ignore-scripts`) may fail building `node-pty` on newer toolchains —
  see Dev setup above.
- `.npmignore` previously excluded `dist/` (a leftover from a generic project template) — every
  publish would have shipped a package with no compiled code in it. Fixed; if `.npmignore` is
  ever touched again, confirm `npm pack --dry-run` still lists `dist/*.js` files.
- **Migrating from the unscoped `homebridge-lutron-radiora3`**: accessories are registered under
  the npm package name, so switching to the `@epthewizard/...` scope orphans any accessories
  cached under the old name. Uninstall the old plugin, clear
  `~/.homebridge/accessories/cachedAccessories`, and let this plugin rediscover everything on
  next Homebridge start. Your `config.json` `"platform": "LutronRadioRA3"` entry (including
  `secrets`) doesn't need to change — only the plugin/package name changed, not the platform name.

## License

The `leap` portion of this plugin (`src/leap/`) is GPL-3.0, inherited from
[lutron-leap-js](https://github.com/thenewwazoo/lutron-leap-js). The rest is Apache-2.0 (see `LICENSE`).
