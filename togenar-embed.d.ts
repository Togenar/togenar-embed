/**
 * Type definitions for <togenar-embed>.
 *
 * Derived from the element's real API surface in togenar-embed.js — keep the two in
 * step. Every method here has a counterpart there; if you add a method, add it here.
 */

/** One configurable part of the current configuration. */
export interface TogenarPart {
  partId: string;
  partLabel: string;
  variantId: string;
  label: string;
  /** The store's own identifier for this variant, when the project defines one. */
  sku: string | null;
  modelName: string;
}

/** The current configuration, as cached from the viewer's `selection_change` stream. */
export interface TogenarSelection {
  parts: TogenarPart[];
  /** Deep link that reproduces this exact configuration. */
  shareUrl: string | null;

  /**
   * Which part is shown in each module slot, keyed by group id. Present only on products that
   * have visibility groups; a slot change fires `selection_change` like any other option change.
   */
  activeMembers?: Record<string, string>;
}

export interface TogenarVariant {
  variantId: string;
  /** The value to pass to `select()` — the same handle that appears in `?part=…`. */
  handle: string;

  /**
   * Present when picking this variant makes the model open or close. `clipName` is the authored
   * clip; drive it with `setAnimationState()`. `null` on a variant that does not move.
   */
  animation?: { clipName: string; mode: 'toggle' } | null;
  label: string;
  sku: string | null;
  swatch?: string | null;
  swatchImage?: string | null;
  modelName?: string;
  isDefault: boolean;
  /** Present once the host has pushed stock via `setAvailability()`. */
  available?: boolean;
}

/** How a part relates to a link group, when it belongs to one. */
export interface TogenarOptionLink {
  role: 'driver' | 'driven';
  groupId: string;
  /** Present on the driver: the parts it sets. */
  drivenPartIds?: string[];
  /** Present on a driven part: the part that sets it. */
  driverPartId?: string;
}

/** Membership of a visibility group — one member is shown at a time. */
export interface TogenarOptionVisibility {
  groupId: string;
  memberPartIds: string[];
  active: boolean;
}

/** One member of a visibility group — an alternative module for the same slot. */
export interface TogenarGroupMember {
  partId: string;
  /** The value to pass to `showPart()`. `null` when the part has no stable handle. */
  partKey: string | null;
  label: string;
  /**
   * Product shot of this module, generated in the panel from the part's own model and served
   * from the CDN. `null` when the panel has not generated one — render the label instead.
   */
  thumb: string | null;
  isActive: boolean;
}

/**
 * A visibility group: an exclusive choice between member parts (only one is shown at a
 * time) — the product's module slots, e.g. "Shelf 1" with 22 alternatives.
 */
export interface TogenarGroup {
  groupId: string;
  label: string;
  activePartId: string | null;
  members: TogenarGroupMember[];
}

export interface TogenarGroupResult extends TogenarResult {
  groupId?: string;
  activePartId?: string;
}

export interface TogenarOption {
  partId: string;
  /** The value to pass as `select(partKey, …)`. */
  partKey: string;
  /** The customer-facing heading the panel authored for this option. */
  label: string;
  defaultVariantId: string;
  /**
   * Whether the built-in picker offers this part to visitors. `false` for parts a link
   * group drives (the driver represents them) unless the panel opted them back in.
   * Filter on this to mirror the published panel instead of re-deriving the rule.
   */
  inPicker: boolean;
  link?: TogenarOptionLink;
  visibility?: TogenarOptionVisibility;
  variants: TogenarVariant[];

  /** Present when the SELECTED variant opens/closes: where it stands right now. */
  animationState?: { open: boolean };
}

/**
 * Live stock, keyed by the SAME handles `getOptions()` reports:
 * `{ body: { walnut: false, oak: true } }` — `false` means out of stock.
 */
export type TogenarAvailability = Record<string, Record<string, boolean>>;

/**
 * Price DISPLAY pushed from the store's catalogue. The viewer never computes prices —
 * your page stays the single source of pricing truth.
 *
 * Numeric values are Intl-formatted with `currency`/`locale`; string values are shown
 * verbatim (pre-format them yourself). `total` is optional and auto-summed when every
 * shown price is numeric.
 */
export interface TogenarPrices {
  currency?: string;
  locale?: string;
  /** Keyed by the SKUs that `getSkus()` / `selection_change` report. */
  items?: Record<string, number | string>;
  total?: number | string;
}

export interface TogenarControls {
  /** Native AR can be launched for the current configuration. */
  ar: boolean;
  /** The project allows the snapshot button. */
  photo: boolean;
  dimensions: { enabled: boolean; on: boolean };
  /** The viewer would be showing its reset-view button — the camera has left its opening framing. */
  resetView: boolean;
}

export interface TogenarResult {
  ok: boolean;
}

export interface TogenarSelectionResult extends TogenarResult {
  selection: TogenarSelection;
}

export interface TogenarAppliedResult extends TogenarResult {
  applied?: unknown;
}

/** Best-effort results: `ok:false` when the capability is unavailable. */
export interface TogenarUrlResult extends TogenarResult {
  url?: string;
}

export interface TogenarArResult extends TogenarResult {
  /** How AR was launched, e.g. Quick Look / Scene Viewer / launcher tab. */
  method?: string;
  reason?: string;
  error?: string;
}

export declare class TogenarEmbed extends HTMLElement {
  /**
   * The current configuration. Cached from the viewer's `selection_change` event
   * (emitted on load and on every change), so this is a synchronous read with no
   * round-trip. Returns `null` until the first event arrives — listen for
   * `togenar:configurator:selection_change` to know when.
   */
  getSelection(): TogenarSelection | null;

  /** Deep link for the current configuration, or `null` before the first selection event. */
  getShareUrl(): string | null;

  /** The SKUs of the current configuration, one per configurable part — your cart payload. */
  getSkus(): string[];

  /**
   * Every part and ALL its variants, with `select()`-ready handles, so the store can build
   * its own option panel without re-deriving slugs.
   */
  getOptions(): Promise<TogenarOption[]>;

  /**
   * Drive a selection from the store's own UI, e.g. `select('body', 'walnut')`.
   * Resolves AFTER the model swap settles, so you can update the cart on completion.
   * Rejects on an unknown handle or timeout.
   */
  select(partKey: string, variantKey: string): Promise<TogenarSelectionResult>;

  /**
   * Set the open/closed state of an option that opens or closes the model (an oven door, a
   * drawer). Separate from `select()`: the choice and its state are different things, so a host
   * that only wants the door open does not re-pick the door.
   *
   * `getOptions()` reports which variant carries one (`variants[].animation`) and where the
   * selected one currently stands (`animationState.open`). Rejects on an unknown handle; resolves
   * `{ ok: false }` when the current variant has no open/close animation.
   */
  setAnimationState(partKey: string, open: boolean): Promise<{ ok: boolean; open?: boolean; error?: string }>;

  /**
   * Every visibility group and all its members, with `showPart()`-ready handles. Use it to
   * offer the product's module slots ("Shelf 1", "Shelf 2") in your own panel — `getOptions()`
   * reports group membership but cannot change it.
   */
  getGroups(): Promise<TogenarGroup[]>;

  /**
   * Show one member of a visibility group, e.g. `showPart('shelf1-two-doors')`. The group is
   * resolved from the member itself and membership is re-checked, so an unknown handle
   * resolves to `{ ok: false }` rather than changing anything.
   */
  showPart(partKey: string): Promise<TogenarGroupResult>;

  /** Reset the configuration to the published default. */
  reset(): Promise<TogenarSelectionResult>;

  /**
   * Push live stock from the store. Out-of-stock swatches are dimmed, struck through and
   * become unselectable in the built-in picker.
   */
  setAvailability(availability: TogenarAvailability): Promise<TogenarAppliedResult>;

  /** Push price display from the store's catalogue. Pass `null` to clear. */
  setPrices(prices: TogenarPrices | null): Promise<TogenarAppliedResult>;

  /** Ease the camera back to its opening framing. */
  resetCamera(): Promise<TogenarResult>;

  /**
   * Show or hide the measurement overlay. Pass nothing to flip it. Set `controls="off"` when the
   * page carries its own controls; the reply's `on` is the state to render on the button.
   */
  setDimensions(on?: boolean): Promise<{ ok: boolean; on?: boolean; error?: string }>;

  /** Flip the measurement overlay. Shorthand for `setDimensions()`. */
  toggleDimensions(): Promise<{ ok: boolean; on?: boolean; error?: string }>;

  /**
   * What the viewer's own control surface would be offering right now. With `controls="off"` this
   * is how your buttons know which ones are live. Re-read on the `togenar:controls` event.
   */
  getControls(): TogenarControls | null;

  /** Shorthand: measurements are switched on for the project. */
  isDimensionsAvailable(): boolean;

  /**
   * Tell the viewer which part the shopper is on, so the camera angle recorded for that part is
   * applied. Call it on section change, not on every pick: comparing finishes of the same part must
   * not move the camera. Pass null on a section that is not a part to ease back to the opening
   * framing. Whether the camera moves at all is the project's setting.
   */
  focusPart(partKey: string | null): Promise<{ ok: boolean; moved?: boolean; partId?: string | null; error?: string }>;

  /**
   * Report that YOUR cart call succeeded, right after the store confirms the add.
   * Fire-and-forget, safe to call on every add, AR or not.
   *
   * This is what makes AR measurable on Android: Google allows no button of ours inside
   * AR and reports nothing when the shopper leaves it, so an add landing shortly after
   * they walk out of AR is credited to that AR session. Without this call, the sale looks
   * like it came from nowhere.
   */
  addedToCart(detail?: Record<string, unknown>): void;

  /**
   * Launch native AR for the current configuration from the HOST's top-level document —
   * iOS Quick Look, Android Scene Viewer, or a device-adaptive launcher tab on desktop.
   *
   * MUST be called synchronously inside your own click/tap handler: the launch fires
   * within that user gesture. URLs are pre-cached from the viewer's `ar-urls` stream, so
   * there is no round-trip to consume the activation. The DOM action has already happened
   * by the time the promise resolves. When the launch URL is still being prepared
   * server-side, resolves `{ ok: true, method: 'preparing' }` and the launch completes
   * automatically once the viewer streams the fresh URL.
   */
  enterAR(): Promise<TogenarArResult>;

  /** True when native AR is available for the current configuration. */
  isArAvailable(): boolean;

  /** PNG data-URL snapshot of the currently-configured model. */
  getSnapshot(): Promise<TogenarUrlResult>;

  /** Short device-adaptive share link (`…/s/{code}`) for the current configuration. */
  getShareLink(): Promise<TogenarUrlResult>;

  /** QR PNG data-URL for the desktop "scan to view in AR" flow. Defaults to the share link. */
  getQr(params?: { text?: string; size?: number }): Promise<TogenarUrlResult>;
}

/** Event names the element dispatches. Any viewer event surfaces as `togenar:${name}`. */
export interface TogenarEventMap {
  'togenar:load': CustomEvent<Record<string, never>>;
  'togenar:ready': CustomEvent<Record<string, unknown>>;
  'togenar:error': CustomEvent<{ message?: string; [key: string]: unknown }>;
  'togenar:configurator:selection_change': CustomEvent<TogenarSelection>;
  'togenar:commerce:add_to_cart_success': CustomEvent<Record<string, unknown>>;
}

declare global {
  interface HTMLElementTagNameMap {
    'togenar-embed': TogenarEmbed;
  }

  interface HTMLElementEventMap extends TogenarEventMap {}
}

/**
 * Attributes accepted by the element. Kept in step with `observedAttributes`.
 */
export interface TogenarEmbedAttributes {
  /** The project to render. Required. (`project-id` is accepted as an alias.) */
  project?: string;
  'project-id'?: string;
  'scene-id'?: string;
  model?: string;
  /** UI language, e.g. `en`, `tr`, `ru`. (`locale` is accepted as an alias.) */
  lang?: string;
  locale?: string;
  mode?: string;
  launcher?: string | boolean;
  /** Render the configurator rather than a plain viewer. */
  configurator?: string | boolean;
  /** Built-in option picker: on by default; turn off to supply your own UI. */
  picker?: string;
  preview?: string;
  /** Override the viewer origin. Defaults to Togenar's. */
  'base-url'?: string;
  /** iframe `allow` policy. Defaults to `xr-spatial-tracking; fullscreen; camera; …`. */
  allow?: string;
  loading?: 'lazy' | 'eager';
  /** CSS aspect ratio, e.g. `1/1` or `16/9`. */
  aspect?: string;
  height?: string;
  'size-hints'?: string | boolean;
  /** Suppress analytics for this embed. */
  na?: string | boolean;
  /** `off` / `none` / `false` / `0` hides the built-in AR button so you can call `enterAR()`. */
  'ar-button'?: string;
  /**
   * `off` / `none` / `false` / `0` takes down the whole built-in control surface — AR, photo,
   * measurements, reset view — so your page draws its own and drives them over the SDK. Named
   * after `<video controls>`. Listen to `togenar:controls` for what each control should offer.
   */
  controls?: string;
  /** Mirror-style ground reflection under the product. Off by default; skipped automatically on heavy models. */
  reflection?: string | boolean;
  /**
   * Product-page URL handed to the viewer for AR flows: it becomes the Quick Look
   * canonical URL, and the QR/AR hand-off returns the shopper to this page (with
   * `togenar_ar_cart=1` after an AR add-to-cart tap). Defaults to the embedding page's
   * own URL. Honoured only when the URL's domain is on the workspace embed allowlist.
   */
  'page-url'?: string;
}

// React / JSX support: `<togenar-embed project="…" configurator />` with autocomplete.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'togenar-embed': TogenarEmbedAttributes &
        React.DetailedHTMLProps<React.HTMLAttributes<TogenarEmbed>, TogenarEmbed>;
    }
  }
}

export {};
