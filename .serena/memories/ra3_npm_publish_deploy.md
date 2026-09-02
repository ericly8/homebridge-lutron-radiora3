# Deployment model: publish to public npm (2026-09-01, confirmed live 2026-09-02)

User runs Homebridge in Docker on Unraid (official `homebridge/homebridge` Community App image)
and wanted a low-friction install/update path there. Decision (asked via AskUserQuestion, user
chose): publish `@epthewizard/homebridge-lutron-radiora3` to the public npm registry, rather
than manual git/tarball installs into the container.

## Confirmed status: published and live
`npm view @epthewizard/homebridge-lutron-radiora3` confirms `0.1.1` on the registry, published
by the user (`npm login`/`npm version patch`/`npm publish` all run by them, not the agent — the
agent never has npm credentials on this machine). Don't re-verify this from scratch each
session; `npm view @epthewizard/homebridge-lutron-radiora3 version` is the fast direct check if
ever in doubt, and works from anywhere with internet (doesn't need the user's network).

## What enabled this
- `package.json`: `"publishConfig": {"access": "public"}` — scoped packages default to
  restricted/private on npm (needs a paid org); explicit public access makes it free.
- `package.json`: `"prepare": "npm run build"` — any install method (git dep, `npm link`, local
  tarball) auto-builds `dist/`.
- **Bug fixed before first publish**: `.npmignore` had `dist` excluded (generic-template
  leftover) — would have shipped zero compiled code. Fixed and verified via `npm pack --dry-run`.

## Install/update — search index lags the registry, this is expected
Homebridge UI's Plugins-tab *search* queries a separate npm search index that can lag the
registry by hours for a freshly published/bumped scoped package (confirmed directly by querying
`registry.npmjs.org/-/v1/search` ourselves — see [[ra3_picker_ui_and_npm_search_lag]]). Not a
bug here. Two ways that always work regardless of search lag, since both hit the registry
directly:
- In Homebridge UI's own **Terminal** tab (a shell already inside the container — confirmed
  present on the user's image, no separate Docker console/`docker exec` needed):
  `hb-service add @epthewizard/homebridge-lutron-radiora3` — Homebridge's own install tool,
  restarts Homebridge automatically. This is the documented/recommended method now.
  `hb-service remove @epthewizard/homebridge-lutron-radiora3` to uninstall.
- Or plain `npm install @epthewizard/homebridge-lutron-radiora3` from the plugin path
  (`/var/lib/homebridge/node_modules` on this user's image) as a fallback.

Configure via the plugin's Settings in Homebridge UI (opens the custom pairing UI, see
[[ra3_leap_discovery_fix]] for pairing, [[ra3_picker_ui_and_npm_search_lag]] for the
virtual-button/zone picker that lives on the same settings screen).

Full instructions are in `README.md` under "Publishing (production deployment)" and "Manual
install via the Homebridge Terminal".
