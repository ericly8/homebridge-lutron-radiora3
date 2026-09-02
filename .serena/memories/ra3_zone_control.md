# Direct zone (switch/dimmer) control (2026-09-01)

User clarified the "HomeKit is slow" complaint was about single individual switches, not
multi-device scenes (that's [[ra3_virtual_button_scenes]]). Root cause: dimmers/switches are
exposed to HomeKit by RA3's Smart Bridge's own *native* built-in bridge — a completely separate
code path this Homebridge plugin has zero involvement in, so nothing here could have been
slowing that down. User chose (via AskUserQuestion) to add direct switch+dimmer control to this
plugin, bypassing the native bridge, on the theory that LEAP-direct control over the same
persistent local connection keypad buttons use will be more responsive.

## What was added
- `Processor` (`src/leap/Processor.ts`): `getZoneDefinition(href)` (`GET <href>` →
  `OneZoneDefinition.Zone`), `getZoneStatus(zone)` (`GET <zone.href>/status` →
  `OneZoneStatus.ZoneStatus`), `subscribeToZoneStatus(zone, cb)` (`SubscribeRequest
  <zone.href>/status`), `setZoneLevel(zone, level)` (`CreateRequest <zone.href>/commandprocessor`
  with `{Command:{CommandType:'GoToLevel',Parameter:[{Type:'Level',Value:level}]}}`). The
  `GoToLevel`/`Parameter` command shape is the standard one across Lutron's LEAP protocol
  (used by e.g. pylutron-caseta for Caseta) but is **inferred, not verified against real RA3
  hardware** — flag this if a zone doesn't respond or reports wrong state.
- `src/ZoneAccessory.ts` (new) — one HomeKit `Lightbulb` (if `ZoneDefinition.ControlType ===
  'Dimmed'` or `Category.IsLight`) or `Switch` (otherwise) per opted-in zone. Two-way: `onSet`
  sends LEAP commands, and a live status subscription (mirrors the keypad-button subscription
  pattern, including re-subscribe on `processor.on('disconnected')`) pushes external state
  changes (physical switch, other apps) back into HomeKit via `updateValue`. Tracks
  `lastBrightness` so toggling a dimmer's `On` off/on restores its previous level instead of
  always snapping to 100.
- `platform.ts`: `GlobalOptions.zones: string[]` (default `[]`, **opt-in**, same pattern as
  `virtualButtons`). `discoverDevices`'s per-area loop fetches `area.AssociatedZones` and wires
  `processZone()` for any whose `ZoneDefinition.Name` is in the list. UUID keyed on
  `zone.href` (zones have no `SerialNumber`).
- `config.schema.json`: `options.zones` string array field.

## Critical caveat surfaced to the user (in README, not just here)
Opting a zone into `options.zones` while RA3's native bridge still also exports it to HomeKit
creates a duplicate accessory for the same physical load with two independently-drifting
states. The user must manually disable that zone's native HomeKit export in the Lutron app
*before* adding it to `options.zones`. This is a one-at-a-time manual migration, not a flag that
flips everything at once — by design, to limit blast radius from an unverified new feature.

## Common user misconception, worth heading off
Users may assume this adds dimming capability to switches generally, or that opting in "gives
dimming to all of them." It doesn't and can't — `dimmable` is purely read from
`ZoneDefinition.ControlType === 'Dimmed'`, i.e. this only mirrors whatever RA3 already knows the
hardware supports. A plain on/off switch stays a plain `Switch` here; nothing about this feature
changes what's physically possible for a given load.

## Scope not covered
Shades and fans are explicitly out of scope for this pass (would need `WindowCovering`/`Fan`
services and different status fields — `Tilt`, `FanSpeed` — already typed in
`MessageBodyTypes.ZoneStatus` but unused).

Full user-facing explanation is in `README.md` under "Direct switch/dimmer control (bypassing
RA3's native HomeKit bridge)".
