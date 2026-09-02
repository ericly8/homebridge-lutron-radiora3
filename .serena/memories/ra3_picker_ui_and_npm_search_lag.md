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
  calls `homebridge.updatePluginConfig()`. This is the primary way to configure both features
  now; the raw config.schema.json array fields still exist as a fallback (Homebridge UI's
  "Use legacy view" button) but the custom UI is what's documented in `README.md`.

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
