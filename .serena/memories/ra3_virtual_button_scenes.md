# RA3 Virtual Button scenes feature (2026-09-01)

Added to work around Apple Home Scenes being slow (client composes a scene as N sequential
HAP writes, one per accessory). RA3 has native Virtual Buttons that trigger a Preset (a scene
defined on the processor) via a single LEAP command — the processor fires every affected zone
over its own bus effectively at once, same as a physical keypad scene button.

## What was added
- `Processor.getVirtualButtons()` / `Processor.pressVirtualButton()` in `src/leap/Processor.ts`
  — `GET /virtualbutton` and `CreateRequest <href>/commandprocessor {Command:{CommandType:'PressAndRelease'}}`.
  The `VirtualButtonDefinition`/`MultipleVirtualButtonDefinition`/`PresetDefinition`/
  `ProgrammingModelDefinition` types already existed in `MessageBodyTypes.ts` (inherited from
  lutron-leap-js) but were never wired up before this.
- `src/VirtualButtonScene.ts` — new accessory class, one HomeKit `Switch` per exposed virtual
  button. `onSet(true)` → `pressVirtualButton()` → `setTimeout` flips the characteristic back
  to `false` after 1s (momentary button behavior, mirrors how a physical scene button works).
- `platform.ts`: `GlobalOptions.virtualButtons: string[]` (default `[]`, i.e. **opt-in** —
  user chose this over auto-exposing every virtual button, to avoid cluttering the Home app
  with internal/programming-only virtual buttons). `discoverDevices` only calls
  `getVirtualButtons()` when that list is non-empty, then wires each `VirtualButtonDefinition`
  whose `Name` is in the list via the new `processVirtualButton()` method (mirrors
  `processDevice`'s accessory-cache/register/unregister lifecycle, but keyed on
  `uuid.generate(virtualButton.href)` since virtual buttons have no `SerialNumber`).
- `config.schema.json`: `options.virtualButtons` — string array, matched against `Name`
  exactly as configured in the Lutron app/Designer.

Full user-facing explanation and config steps are in `README.md` under "Scenes (Virtual
Buttons)". See also [[ra3_leap_discovery_fix]] for the other fixes in this same fork.
