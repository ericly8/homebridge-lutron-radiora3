# Deployment model: publish to public npm (2026-09-01)

User runs Homebridge in Docker on Unraid and wanted a low-friction install/update path there.
Decision (asked via AskUserQuestion, user chose): publish `@epthewizard/homebridge-lutron-radiora3`
to the public npm registry, rather than manual git/tarball installs into the container. This
makes it installable/updatable through Homebridge UI's normal Plugins search on any host
(Unraid Docker included) — no `docker exec`/shell access needed.

## What enabled this
- `package.json`: added `"publishConfig": {"access": "public"}` — scoped packages (`@user/...`)
  default to restricted/private on npm, which requires a paid org; explicit public access makes
  it a normal free public package instead.
- `package.json`: added `"prepare": "npm run build"` — makes any `npm install` of this package
  (git dependency, `npm link`, local tarball) auto-build `dist/`, not just `npm publish` (which
  already had `prepublishOnly` covering lint+build).
- **Bug fixed**: `.npmignore` had `dist` in its ignore list (line 104, a leftover from a generic
  project template — sat right under a "Nuxt.js build output" comment, clearly copied from a
  different project shape). This meant `npm pack`/`npm publish` would have shipped a package
  with NO compiled code — completely non-functional once installed. Removed. Verified via
  `npm pack --dry-run` that `dist/*.js` and `homebridge-ui/` are now included in the tarball.

## Publish workflow (must be run by the user — needs their npm credentials)
```
npm login
npm version patch   # or minor/major; npm refuses to republish an existing version number
npm publish          # runs prepublishOnly (lint+build) automatically
```
Was not logged into npm on this dev machine (`npm whoami` → ENEEDAUTH) when this was set up —
publish itself was never run by the agent, only prepared. Confirm with the user whether they've
since published before assuming the package actually exists on the registry.

## Post-publish install (any Homebridge host, including Unraid Docker)
Homebridge UI → Plugins → search `homebridge-lutron-radiora3` or `epthewizard` → Install →
restart Homebridge → configure via the plugin's Settings (opens the custom pairing UI, see
[[ra3_leap_discovery_fix]] for the pairing flow itself). No manual npm/docker steps needed once
published — this was the whole point of choosing this path over manual git/tarball installs.

Full instructions are in `README.md` under "Publishing (production deployment)".
