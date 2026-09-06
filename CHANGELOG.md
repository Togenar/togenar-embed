# Changelog

Every release of `@togenar/embed`. The release workflow reads the section for the version being
published and refuses to tag without one, so a version that is not described here cannot ship.

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
