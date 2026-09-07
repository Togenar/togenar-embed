# Changelog

Every release of `@togenar/embed`. The release workflow reads the section for the version being
published and refuses to tag without one, so a version that is not described here cannot ship.

## 1.5.0

- **`controls="off"`** — one switch that takes down the viewer's entire built-in control surface:
  AR button, snapshot button, ruler icon, reset-view button, and the embed's own AR button with
  them. Named after `<video controls>`. A page that styles its own controls no longer needs a
  separate attribute per button, and a control added to the viewer later is covered automatically.
  `ar-button="off"` still hides just that one button.
- **`setDimensions(on?)` / `toggleDimensions()`** — show or hide the product's measurement overlay;
  omit the argument to flip it. Resolves with `{ ok, on }`. Measurements have to be enabled for the
  project (**WebAR settings → Dimensions**), otherwise it resolves `{ ok: false }` and changes
  nothing; inside an AR session it declines the same way.
- **`getControls()` and the `togenar:controls` event** — what the viewer's own controls would be
  offering right now: `{ ar, photo, dimensions: { enabled, on }, resetView }`. Bind your buttons to
  it so they appear exactly when the built-in ones would have. `isDimensionsAvailable()` is the
  shorthand for the measurement flag.

Needs a viewer that speaks `controls=off` — deployed to `model.togenar.com` before this release.

## 1.4.1

- **Types:** `TogenarSelection.activeMembers` — which part is shown in each module slot, keyed by
  group id. The event has carried it since 1.4.0 on products that have visibility groups; only the
  type declaration was missing, so TypeScript hosts had to cast to read it.
- **Docs:** `setAnimationState()` is now in the README method table.

No runtime change: `togenar-embed.js` is byte-identical to 1.4.0.

## 1.4.0

- **`focusPart(partKey)`** — apply the camera angle recorded for a part, for hosts that render their
  own option panel and want the camera to follow their section changes. `null` returns to the
  opening framing.
- **`setAnimationState(partKey, open)`** — open or close an option that moves (an oven door, a
  drawer), separately from `select()`. Idempotent, and `getOptions()` reports which variants carry
  an open/close animation (`variants[].animation`) and where the selected one stands
  (`animationState.open`).
- `togenar:configurator:selection_change` also fires when a module slot changes — from the built-in
  picker or from your own `showPart()` call.

## Earlier releases

1.3.0 and older predate this file; see the tags on
[github.com/Togenar/togenar-embed](https://github.com/Togenar/togenar-embed/tags).
