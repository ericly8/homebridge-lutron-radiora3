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
