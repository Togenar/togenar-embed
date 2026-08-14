/**
 * Type definitions for the Togenar Shopify connector.
 *
 * Derived from togenar-shopify.js — keep the two in step. The connector wires a
 * `<togenar-embed shopify>` element to the surrounding Shopify storefront: it builds
 * a SKU → variant map from `/products/{handle}.js`, pushes prices and stock into the
 * embed, and adds the current configuration to the cart via `/cart/add.js`.
 */

import type { TogenarEmbed, TogenarOption } from './togenar-embed';

/** One Shopify variant, keyed by the SKU shared with the Togenar configurator. */
export interface TogenarShopifyVariantEntry {
  /** Shopify's internal variant ID — what `/cart/add.js` accepts. */
  variantId: number;
  /** Variant price in minor units (cents), as returned by the product JSON. */
  priceCents: number;
  available: boolean;
  /** Handle of the product this variant belongs to. */
  handle: string;
}

export interface TogenarShopifyCartItem {
  id: number;
  quantity: number;
  /** Line-item properties; `_togenar` carries the configuration share link. */
  properties?: { _togenar: string };
}

export interface TogenarShopifyOptions {
  /** Product handles to fetch. Defaults to the `shopify-handles` attribute, then the current `/products/{handle}` page. */
  handles?: string[];
  /** ISO currency code shown with prices. Defaults to `shopify-currency`, then `window.Shopify.currency.active`. */
  currency?: string;
  /** BCP-47 locale used to format prices. Defaults to `shopify-locale`, then `<html lang>`. */
  locale?: string;
  /** `'cart'` redirects to the cart page after a successful add. Defaults to `shopify-goto-cart`, then stay. */
  gotoCart?: string;
  /** `'off'` disables the automatic add-to-cart on AR hand-off return. Defaults to `shopify-ar-return`. */
  arReturn?: string;
  /** Injectable fetch for tests. Defaults to `window.fetch`. */
  fetchImpl?: typeof fetch;
  win?: Window;
  doc?: Document;
}

export interface TogenarShopifyConnector {
  /** Resolves once products are fetched and prices/stock are pushed into the embed. */
  ready: Promise<void>;
  /** Re-fetches the products and re-pushes prices and stock. */
  refresh(): Promise<void>;
  /** Removes all listeners. The embed itself is left untouched. */
  destroy(): void;
}

/**
 * Wires one embed element to the surrounding Shopify storefront. Returns `null`
 * when element, window, document, or fetch is missing. Auto-runs for every
 * `togenar-embed[shopify]` on the page unless `window.__togenarShopifyNoAutoInit` is set.
 */
export declare const createShopifyConnector: (
  el: TogenarEmbed,
  opts?: TogenarShopifyOptions,
) => TogenarShopifyConnector | null;

export declare const inferHandle: (pathname: string | null | undefined) => string | null;
export declare const shopifyRoot: (win: Window | null | undefined) => string;
export declare const parseHandles: (attrValue: string | null | undefined, pathname: string | null | undefined) => string[];
export declare const fetchProduct: (fetchImpl: typeof fetch, root: string, handle: string) => Promise<unknown | null>;
export declare const buildSkuMap: (products: unknown[]) => Map<string, TogenarShopifyVariantEntry>;
export declare const buildPricesPayload: (
  map: Map<string, TogenarShopifyVariantEntry>,
  currency?: string | null,
  locale?: string | null,
) => { items: Record<string, number>; currency?: string; locale?: string } | null;
export declare const buildAvailability: (
  options: TogenarOption[] | null,
  map: Map<string, TogenarShopifyVariantEntry>,
) => Record<string, Record<string, boolean>> | null;
export declare const resolveCartItems: (
  skus: string[],
  map: Map<string, TogenarShopifyVariantEntry>,
  shareUrl: string | null,
) => { items: TogenarShopifyCartItem[]; unmapped: string[] };
export declare const addToCart: (fetchImpl: typeof fetch, root: string, items: TogenarShopifyCartItem[]) => Promise<unknown>;
