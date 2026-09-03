# Deployment model: publish to public npm (2026-09-01, confirmed live 2026-09-02)

User runs Homebridge in Docker on Unraid (official `homebridge/homebridge` Community App image)
and wanted a low-friction install/update path there. Decision (asked via AskUserQuestion, user
chose): publish `@epthewizard/homebridge-lutron-radiora3` to the public npm registry, rather
than manual git/tarball installs into the container.

## Confirmed status: last CONFIRMED live version is 0.1.1 — 0.1.2 outcome unknown
`npm view @epthewizard/homebridge-lutron-radiora3` confirmed `0.1.1` live on 2026-09-02, published
by the user (`npm login`/`npm version patch`/`npm publish` all run by them, not the agent — the
agent never has npm credentials on this machine). On 2026-09-03 the user bumped to `0.1.2`
(`npm version patch` succeeded, commit+tag exist) but the following `npm publish` failed with
`E404 Not Found` on the registry PUT — see the login gotcha below. Whether a retry succeeded
afterward was **not confirmed before the session ended**. Always run
`npm view @epthewizard/homebridge-lutron-radiora3 version` to check what's actually live rather
than assuming from `package.json`'s version or prior chat history — those can be ahead of what's
actually published.

## Gotcha: `npm publish` E404 usually means an expired login, not a broken package
Seen 2026-09-03: `npm publish` built and packed the tarball fine, then failed with `npm error
code E404` / `404 Not Found - PUT .../@epthewizard%2fhomebridge-lutron-radiora3`. This is
npm's response for an unauthenticated or wrong-account publish attempt on a scoped package, not
an actual missing resource — nothing about the code/package changed between the working `0.1.1`
publish and this failure. Fix: user checks `npm whoami` (re-`npm login` if empty/wrong account)
and `npm config get registry` (should be `https://registry.npmjs.org/`), then just re-runs
`npm publish` — no need to bump the version again, the failed attempt didn't consume it.

## Gotcha: uninstalling the plugin wipes its stored pairing secrets
Uninstalling via Homebridge UI or `hb-service remove` strips the plugin's whole config block out
of `config.json`, including the stored `secrets` (pairing cert/key/CA) — not just the npm
package. A processor that was previously paired and connecting fine will show "Associate" (i.e.
unpaired) in Settings after any uninstall/reinstall cycle (e.g. removing an npm install to test a
git build, per README's "Installing a pre-release build directly from GitHub" section). This is expected — re-pair
via Associate + the physical button press — not a regression or a config-persistence bug.

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
