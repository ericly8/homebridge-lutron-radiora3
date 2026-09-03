# Virtual button/zone picker UI + npm search-index lag (2026-09-02)

## Picker UI (replaces blind name-typing)
User pointed out `options.virtualButtons`/`options.zones` required typing exact names blind,
with no visibility into what actually exists (especially annoying for a virtual button
they'd renamed). Added a live browse/checkbox picker to the plugin's existing custom
Homebridge UI settings screen (`homebridge-ui/`):

- `homebridge-ui/server.js`: new `/browse` endpoint (`doBrowse`) — opens its own short-lived
  `LeapClient`+`Processor` connection (separate from the running plugin's connection, same
  pattern as the existing `/connect` endpoint) using the processor's already-stored `secrets`,
  walks `processor.getAreas()` → `getZoneDefinition()` per `AssociatedZones` href to build a
  `{name, area, controlType}` list, and `processor.getVirtualButtons()` for `{name}`. Always
  calls `processor.close()` in a `finally` to avoid leaking the ping-loop timer/socket in the
  Homebridge UI's own long-running Node process.
- `homebridge-ui/public/index.html`: new `#resources` section, populated by `loadResources()`
  called from `handleConnected()` (fires whenever a processor reaches ASSOCIATED, both on fresh
  pairing and on reopening settings for an already-paired processor). Renders checkboxes —
  zones grouped by room/area name, virtual buttons flat — pre-checked from the current
  `options.virtualButtons`/`options.zones` arrays, and `onchange` pushes/splices the name and
  calls `homebridge.updatePluginConfig()`. This is the *only* way to configure both features now
  — the "Use legacy view" fallback button (dropped into the raw config.schema.json blind-array
  form) was removed entirely on 2026-09-03 for being confusing dead weight; don't re-add a
  schema-form escape hatch.

## Bug fixed 2026-09-03: connection leak + missing timeout made the picker hang forever
Real-hardware testing (Unraid, firmware 26.05.27f000) surfaced this as "Connected!" shows, but
the Scenes & Switches section never appears — no error, no toast, just silence, reproducible on
every attempt. Root cause, found by reading the connection code (no live debug access was
needed/available):
- `doConnect` (`homebridge-ui/server.js`) opened a `LeapClient` purely to verify stored secrets
  still work, then **never closed it**. It's called every time the settings page's mDNS discovery
  re-fires for an already-known processor — which happens repeatedly while Settings stays open,
  not just once — so every reopen of Settings leaked another live connection to the processor.
- `LeapClient.connect()` (`src/leap/LeapClient.ts`) had **no timeout at all**. Once enough leaked
  connections filled up the processor's connection slots, a later connection attempt (like the
  one `/browse` opens for the scenes/zones list) would just hang at the TCP/TLS handshake stage —
  the promise never resolved or rejected, so nothing ever happened client-side.
Fixed: `doConnect` now closes its verification client in a `finally` block; `LeapClient.connect()`
now has a 10s timeout (`CONNECT_TIMEOUT_MS`) that rejects with a clear error and destroys the
socket if neither `secureConnect` nor `error` fires in time. Apply both invariants — always close
a short-lived `LeapClient`/`Processor`, always assume `connect()` needs a bounded wait — to
anything else added to `homebridge-ui/server.js`.

## STILL BROKEN as of 2026-09-04, even with the leak/timeout fix live
User confirmed installing `0.1.2` via `hb-service add` (verified this contains the fix — the
plugin card showed the update applied) and restarting. Settings still shows "Connected!" with
the Scenes & Switches section never appearing — but now with **zero errors** (no toast, no
hang — it resolves, just apparently empty). This is a different failure mode than the leak/hang
bug: `/browse` is completing successfully and returning nothing to show, OR returning something
`renderResources()` doesn't consider non-empty. Two live hypotheses, unconfirmed:
1. `doBrowse`'s zone loop (`if (!area.IsLeaf) continue`) may never find `IsLeaf: true` on this
   firmware — same class of bug as the already-fixed `ControlStations`-missing-`Body` issue in
   [[ra3_leap_discovery_fix]]. `platform.ts`'s real discovery loop uses the identical
   `IsLeaf`/`AssociatedZones` pattern and **has never been confirmed working against real zones**
   on this user's hardware either (zone discovery has literally never been observed succeeding
   in this project yet, only keypad/control-station discovery has).
2. The Virtual Buttons the user actually wants (see below) may not be what `getVirtualButtons()`
   (`GET /virtualbutton`) returns at all.

Diagnostic logging was added to `doBrowse` (`homebridge-ui/server.js`, commit `b312b25`,
**not yet pushed to origin or published to npm as of session end 2026-09-04** — a next session
must push/publish it before it's actually testable) that logs, server-side (visible in
Homebridge UI's own Logs page, not the plugin's accessory log): area count + per-area
`{name, isLeaf, zoneCount}`, resolved zone count, and raw virtual-button names before mapping.
**Next step: get that log output** after the user reinstalls with this build and reopens
Settings — it will show definitively whether areas/zones are being found at all, and whether
`/virtualbutton`'s raw name list includes the button names the user actually wants (see next
section) or is empty/different.

## User's actual concrete goal (don't lose this in further debugging)
The user's real ask, stated plainly on 2026-09-04: expose a button named **"1st Floor Off"** as
a real tappable HomeKit tile. This button is NOT found under any "Virtual Buttons" menu in the
Lutron app — it's on a virtual remote device named **"Smartphone"** (Lutron app → Devices tab →
"Homeowner" section → "Smartphone", shown ×2 → tapping it opens a paginated picker: "Homeowner /
Smartphone / 1 of 2" → 7 buttons per page × 2 pages, e.g. "1st Floor Off" (page 1, already
programmed), "Button 2".."Button 7" (unprogrammed placeholders) → an "Edit" link to
rename/reprogram). This is Lutron's own "virtual Pico remote tied to your phone" app feature.

**Open architectural question, not yet resolved**: is a "Smartphone" virtual-remote button the
same LEAP entity as a Designer-created Virtual Button/Preset (i.e. does `getVirtualButtons()`
already include "1st Floor Off" in its results, just never surfaced because of bug #1/#2 above)?
Or is it a structurally different entity — e.g. more like a keypad's `ButtonGroup`/`Button`
under a virtual `/device` (the same shape [[ra3_leap_discovery_fix]]'s `SunnataKeypad.ts`
already knows how to walk), which would mean **it needs new discovery code, not a bug fix** in
the existing `/virtualbutton` path. If it turns out to be the keypad-style entity, watch out:
that path produces `StatelessProgrammableSwitch` services, which per
[[ra3_leap_discovery_fix]]'s Home-app-visibility gotcha **do not render as tiles** — exposing it
that way would satisfy discovery but not the user's actual visible-tile requirement, so it would
need to go through the `Switch`-producing path (like [[ra3_virtual_button_scenes]]) instead,
regardless of which LEAP endpoint it's actually discovered through. The diagnostic log output
described above is the fastest way to settle which case this is — check the raw virtual-button
names first before writing any new discovery code.

## npm search-index lag is real and was confirmed directly
Diagnosed live: `npm view @epthewizard/homebridge-lutron-radiora3` found the package
immediately (registry has it, published within the hour at the time), but
`https://registry.npmjs.org/-/v1/search?text=...` — what Homebridge UI's plugin search actually
queries — did NOT return it even for its exact full name, many hours after publish. This is a
known npm quirk that hits scoped packages harder than unscoped ones. Not a bug in this repo;
nothing to fix in code. Documented in README's "Publishing" section as an expected, sometimes
hours-long gap between "published" and "found via Homebridge UI search" — the workaround is
installing by exact name via a shell in the Homebridge container
(`npm install @epthewizard/homebridge-lutron-radiora3`), which hits the registry directly and
is unaffected by the search-index lag.

See also [[ra3_npm_publish_deploy]], [[ra3_virtual_button_scenes]], [[ra3_zone_control]].
