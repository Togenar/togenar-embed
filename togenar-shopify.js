const WARN_PREFIX = 'togenar-shopify:';

const warn = (...args) => {
  try { console.warn(WARN_PREFIX, ...args); } catch { }
};

const pick = (v) => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

export const inferHandle = (pathname) => {
  const m = /\/products\/([^/?#]+)/.exec(String(pathname ?? ''));
  return m ? decodeURIComponent(m[1]) : null;
};

export const shopifyRoot = (win) => {
  try {
    const root = win && win.Shopify && win.Shopify.routes && win.Shopify.routes.root;
    return typeof root === 'string' && root ? root : '/';
  } catch { return '/'; }
};

export const parseHandles = (attrValue, pathname) => {
  const out = [];
  const seen = new Set();
  const push = (h) => {
    const v = pick(h);
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  };
  if (pick(attrValue)) String(attrValue).split(',').forEach(push);
  else push(inferHandle(pathname));
  return out;
};

export const fetchProduct = async (fetchImpl, root, handle) => {
  const url = `${root}products/${encodeURIComponent(handle)}.js`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      warn(`product "${handle}" fetch failed (${res.status}) — is it published to the Online Store channel?`);
      return null;
    }
    return await res.json();
  } catch (e) {
    warn(`product "${handle}" fetch failed`, (e && e.message) || e);
    return null;
  }
};

export const buildSkuMap = (products) => {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    if (!product || !Array.isArray(product.variants)) continue;
    for (const variant of product.variants) {
      const sku = pick(variant && variant.sku);
      if (!sku) continue;
      if (map.has(sku)) {
        warn(`duplicate SKU "${sku}" — keeping the first variant found`);
        continue;
      }
      map.set(sku, {
        variantId: variant.id,
        priceCents: typeof variant.price === 'number' ? variant.price : Number(variant.price),
        available: variant.available !== false,
        handle: product.handle,
      });
    }
  }
  return map;
};

export const buildPricesPayload = (map, currency, locale) => {
  const items = {};
  let count = 0;
  for (const [sku, entry] of map) {
    if (!Number.isFinite(entry.priceCents)) continue;
    items[sku] = entry.priceCents / 100;
    count++;
  }
  if (!count) return null;
  const payload = { items };
  if (currency) payload.currency = currency;
  if (locale) payload.locale = locale;
  return payload;
};

export const buildAvailability = (options, map) => {
  const out = {};
  let count = 0;
  for (const part of Array.isArray(options) ? options : []) {
    if (!part || !Array.isArray(part.variants)) continue;
    const partKey = part.partKey || part.partId;
    if (!partKey) continue;
    for (const variant of part.variants) {
      const sku = pick(variant && variant.sku);
      if (!sku || !map.has(sku)) continue;
      const variantKey = variant.handle || variant.variantId;
      if (!variantKey) continue;
      if (!out[partKey]) out[partKey] = {};
      out[partKey][variantKey] = map.get(sku).available;
      count++;
    }
  }
  return count ? out : null;
};

export const resolveCartItems = (skus, map, shareUrl) => {
  const byVariant = new Map();
  const unmapped = [];
  for (const sku of Array.isArray(skus) ? skus : []) {
    const entry = map.get(sku);
    if (!entry) {
      if (!unmapped.includes(sku)) unmapped.push(sku);
      continue;
    }
    const existing = byVariant.get(entry.variantId);
    if (existing) existing.quantity++;
    else {
      const item = { id: entry.variantId, quantity: 1 };
      if (shareUrl) item.properties = { _togenar: shareUrl };
      byVariant.set(entry.variantId, item);
    }
  }
  return { items: [...byVariant.values()], unmapped };
};

export const addToCart = async (fetchImpl, root, items) => {
  const res = await fetchImpl(`${root}cart/add.js`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items }),
  });
  let body = null;
  try { body = await res.json(); } catch { }
  if (!res.ok) {
    const message = (body && (body.description || body.message)) || `cart add failed (${res.status})`;
    throw new Error(message);
  }
  return body;
};

export const createShopifyConnector = (el, opts = {}) => {
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const fetchImpl = opts.fetchImpl || (win && win.fetch ? win.fetch.bind(win) : null);
  if (!el || !win || !doc || !fetchImpl) {
    warn('missing element, window, document, or fetch — connector not started');
    return null;
  }

  const attr = (name) => pick(el.getAttribute && el.getAttribute(name));
  const root = shopifyRoot(win);
  const currency = pick(opts.currency) || attr('shopify-currency')
    || pick(win.Shopify && win.Shopify.currency && win.Shopify.currency.active);
  const locale = pick(opts.locale) || attr('shopify-locale')
    || pick(doc.documentElement && doc.documentElement.lang);
  const gotoCart = (pick(opts.gotoCart) || attr('shopify-goto-cart')) === 'cart';
  const arReturn = (pick(opts.arReturn) || attr('shopify-ar-return')) !== 'off';
  const handles = Array.isArray(opts.handles) && opts.handles.length
    ? opts.handles
    : parseHandles(attr('shopify-handles'), win.location && win.location.pathname);

  let map = new Map();
  let inFlight = false;
  let destroyed = false;
  let arPending = false;
  const warnedSkus = new Set();
  const buttons = [];

  const dispatch = (name, detail) => {
    try { el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })); } catch { }
  };

  const currentSkus = () => (typeof el.getSkus === 'function' ? el.getSkus() : []) || [];

  const hasMappedSelection = () => currentSkus().some((sku) => map.has(sku));

  const warnUnmapped = (skus) => {
    for (const sku of skus) {
      if (warnedSkus.has(sku)) continue;
      warnedSkus.add(sku);
      warn(`SKU "${sku}" not found in fetched products — add its product handle to shopify-handles`);
    }
  };

  const setButtonsDisabled = (disabled) => {
    for (const btn of buttons) {
      try {
        btn.disabled = disabled;
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      } catch { }
    }
  };

  const updateGate = () => {
    if (!destroyed) setButtonsDisabled(inFlight || !hasMappedSelection());
  };

  const runAdd = async () => {
    if (inFlight || destroyed) return;
    const { items, unmapped } = resolveCartItems(currentSkus(), map, typeof el.getShareUrl === 'function' ? el.getShareUrl() : null);
    warnUnmapped(unmapped);
    if (!items.length) {
      dispatch('togenar:commerce:add_to_cart_fail', { reason: 'no_mapped_skus', skus: currentSkus() });
      return;
    }
    inFlight = true;
    updateGate();
    try {
      const cart = await addToCart(fetchImpl, root, items);
      dispatch('togenar:commerce:add_to_cart_success', { items, cart, skus: currentSkus() });
      try { if (typeof el.addedToCart === 'function') el.addedToCart({ source: 'shopify', items }); } catch { }
      if (gotoCart && win.location) win.location.assign(`${root}cart`);
    } catch (e) {
      dispatch('togenar:commerce:add_to_cart_fail', {
        reason: 'cart_error',
        message: (e && e.message) || String(e),
        skus: currentSkus(),
      });
    } finally {
      inFlight = false;
      updateGate();
    }
  };

  const onSelectionChange = () => {
    updateGate();
    if (arPending && hasMappedSelection()) {
      arPending = false;
      runAdd();
    }
  };

  const onButtonClick = (event) => {
    try { event.preventDefault(); } catch { }
    runAdd();
  };

  const bindButtons = () => {
    const candidates = doc.querySelectorAll ? doc.querySelectorAll('[data-togenar-add-to-cart]') : [];
    const shopifyEmbeds = doc.querySelectorAll ? doc.querySelectorAll('togenar-embed[shopify]') : [];
    for (const btn of candidates) {
      const selector = pick(btn.getAttribute && btn.getAttribute('data-togenar-add-to-cart'));
      if (selector) {
        let target = null;
        try { target = doc.querySelector(selector); } catch { }
        if (target !== el) continue;
      } else if (shopifyEmbeds.length > 1) {
        warn('multiple togenar-embed[shopify] elements on the page — give data-togenar-add-to-cart a selector value');
        continue;
      }
      buttons.push(btn);
      btn.addEventListener('click', onButtonClick);
    }
  };

  const detectArReturn = () => {
    if (!arReturn || !win.location) return;
    try {
      const params = new URLSearchParams(win.location.search || '');
      if (params.get('togenar_ar_cart') !== '1') return;
      arPending = true;
      params.delete('togenar_ar_cart');
      const query = params.toString();
      const next = (win.location.pathname || '') + (query ? `?${query}` : '') + (win.location.hash || '');
      if (win.history && typeof win.history.replaceState === 'function') win.history.replaceState(null, '', next);
    } catch { }
  };

  const loadProducts = async () => {
    if (!handles.length) {
      warn('no product handle — set shopify-handles or place the embed on a product page');
      return;
    }
    const products = (await Promise.all(handles.map((h) => fetchProduct(fetchImpl, root, h)))).filter(Boolean);
    map = buildSkuMap(products);
    if (!map.size) {
      warn('no variant SKUs found in fetched products — Togenar variation SKUs must match Shopify variant SKUs');
      return;
    }
    const prices = buildPricesPayload(map, currency, locale);
    if (prices && typeof el.setPrices === 'function') {
      try { await el.setPrices(prices); } catch (e) { warn('setPrices failed', (e && e.message) || e); }
    }
    if (typeof el.getOptions === 'function' && typeof el.setAvailability === 'function') {
      try {
        const availability = buildAvailability(await el.getOptions(), map);
        if (availability) await el.setAvailability(availability);
      } catch (e) { warn('setAvailability failed', (e && e.message) || e); }
    }
  };

  el.addEventListener('togenar:configurator:selection_change', onSelectionChange);
  bindButtons();
  setButtonsDisabled(true);
  detectArReturn();

  const ready = loadProducts().then(() => {
    onSelectionChange();
  });

  return {
    ready,
    refresh() {
      return loadProducts().then(() => {
        onSelectionChange();
      });
    },
    destroy() {
      destroyed = true;
      el.removeEventListener('togenar:configurator:selection_change', onSelectionChange);
      for (const btn of buttons) {
        try { btn.removeEventListener('click', onButtonClick); } catch { }
      }
      buttons.length = 0;
    },
  };
};

const autoInit = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__togenarShopifyNoAutoInit) return;
  const start = () => {
    const ce = window.customElements;
    const whenDefined = ce && typeof ce.whenDefined === 'function'
      ? ce.whenDefined('togenar-embed')
      : Promise.resolve();
    whenDefined.then(() => {
      document.querySelectorAll('togenar-embed[shopify]').forEach((el) => createShopifyConnector(el));
    }).catch(() => { });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
};

autoInit();
