# homebridge-lutron-radiora3

Homebridge plugin for **Lutron RadioRA 3** processors (LEAP protocol). Confirmed working
against firmware `26.05.26f000`. The platform explicitly checks `DeviceType ===
'RadioRa3Processor'` and `ProductType === 'Lutron RadioRA 3 Project'` on startup and refuses
to run against anything else (RA2, Caseta) — this is not a generic Lutron plugin.

Supports:
* Sunnata Keypads / Sunnata Hybrid Keypads → HomeKit Stateless Programmable Switches (single/double/long press per button)
* Pico remotes (untested on real hardware beyond basic cases)

Dimmers, switches, shades, etc. are **not** implemented here — RA3's Smart Bridge already
exposes those to HomeKit natively. This plugin only fills the gap for keypads/Picos, which
the Smart Bridge doesn't expose.

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

```bash
git clone git@github.com:epthewizard/homebridge-lutron-radiora3.git
cd homebridge-lutron-radiora3

# homebridge-config-ui-x pulls in node-pty, a native addon that fails to build from
# source on newer Node/clang toolchains. It's only needed for the UI's terminal
# feature, not for building/running this plugin, so skip its install scripts:
npm install --ignore-scripts

npm run build      # rimraf dist && tsc
npm run lint        # eslint

npm link             # registers this checkout as the global `homebridge-lutron-radiora3` package
```

Then, inside your Homebridge install directory (wherever its own `package.json`/`node_modules` live):

```bash
npm link homebridge-lutron-radiora3
```

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

## Production deployment

For a personal single-house setup, "production" is just: build once, keep it linked, restart
Homebridge on updates.

**Same machine as dev** — nothing extra needed beyond the dev setup above; `npm link` persists
across restarts since it's a symlink in the global `node_modules`.

**Homebridge runs on a different machine (e.g. a Pi)** — pick one:

```bash
# Option A: build on the Pi directly (simplest, avoids cross-arch native-module issues)
git clone git@github.com:epthewizard/homebridge-lutron-radiora3.git
cd homebridge-lutron-radiora3 && npm install --ignore-scripts && npm run build && npm link
# then, in the Homebridge install dir on the Pi:
npm link homebridge-lutron-radiora3

# Option B: build on dev machine, ship a tarball
npm run build
npm pack                       # produces homebridge-lutron-radiora3-<version>.tgz
scp homebridge-lutron-radiora3-*.tgz pi@homebridge:/tmp/
# on the Pi, inside the Homebridge install dir:
npm install /tmp/homebridge-lutron-radiora3-*.tgz
```

Redeploying after a change: pull, rebuild, restart Homebridge. There's no hot reload outside
`npm run watch` in dev.

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

## License

The `leap` portion of this plugin (`src/leap/`) is GPL-3.0, inherited from
[lutron-leap-js](https://github.com/thenewwazoo/lutron-leap-js). The rest is Apache-2.0 (see `LICENSE`).
