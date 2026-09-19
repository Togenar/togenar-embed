# Changelog

Every release of `@togenar/embed`. The release workflow reads the section for the version being
published and refuses to tag without one, so a version that is not described here cannot ship.

## 1.7.0

- **Why an option is blocked.** `getOptions()` variants and `getGroups()` members now carry
  `disabledReason` (`'rule'` | `'stock'`, `null` while pickable) and `blockedBy` — the selections
  a rule blocks them on, as `[{ partId, partKey, variantId, handle }]` — next to the existing
  `available`. A store panel can say *"not available with Body: Oak"* instead of only greying a
  swatch. A rule outranks stock when both apply; `blockedBy` is empty for stock and for an option
  that is ruled out only because picking it would leave no valid configuration.
- **`select()` no longer reports success for a pick it did not make.** An option a rule or your
  stock blocks used to resolve `{ ok: true }` with the selection unchanged. It now resolves
  `{ ok: false, error: 'blocked', reason, blockedBy, selection }`. `showPart()` on a blocked
  module answers the same way (`reason: 'rule'`) instead of a bare `activation refused`. Code that
  branches on `ok` now sees the refusal; code that ignored it behaves as before.
- Both changes are served by the viewer, so they reach every embed as soon as it loads the
  current viewer; this release adds the types and the documentation.

## 1.6.0

- **`getProducts()` / `selectProduct(productKey)`** — a configurator with more than one product
  (a two-seater and a one-seater of the same sofa) can now be switched from your own panel.
  `getProducts()` resolves `[{ productId, key, label, active }]`; `selectProduct('one-seater')`
  takes the same key `?product=` carries, runs the same switch as the built-in panel's product
  header and resolves `{ ok, product, selection }` once the new product has loaded. An unknown key
  resolves `{ ok: false }` and changes nothing. Until now a host panel (`picker="off"`) could only
  ever show the first product.
- **`togenar:configurator:product_change`** — fires on every product change, from the built-in
  panel or `selectProduct()`, with `{ product, productId, label }`. A `selection_change` now
  follows it, so `getSelection()`, `getSkus()` and `getShareUrl()` stop describing the previous
  product.

Needs a viewer that routes `getProducts` / `selectProduct` — deployed to `model.togenar.com`
before this release.

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
