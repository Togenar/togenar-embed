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
}

export interface TogenarVariant {
  variantId: string;
  /** The value to pass to `select()` — the same handle that appears in `?part=…`. */
  handle: string;
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
  /** Mirror-style ground reflection under the product. Off by default; skipped automatically on heavy models. */
  reflection?: string | boolean;
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
