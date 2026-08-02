<p align="center">
  <a href="https://togenar.com">
    <img src="https://api.togenar.com/images/togenar-mail-logo.png" alt="Togenar" width="220">
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@togenar/embed"><img src="https://img.shields.io/npm/v/@togenar/embed" alt="npm version"></a>
  <a href="https://packagephobia.com/result?p=@togenar/embed"><img src="https://packagephobia.com/badge?p=@togenar/embed" alt="install size"></a>
  <a href="https://www.npmjs.com/package/@togenar/embed"><img src="https://img.shields.io/npm/types/@togenar/embed" alt="types"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@togenar/embed" alt="license"></a>
</p>

# `<togenar-embed>` — live 3D product configurator & AR for any storefront

`@togenar/embed` is the official Togenar web component. One script tag — or one `import` —
puts a live 3D product configurator with native iOS / Android AR on any product page:
shoppers pick colors, materials and options, see the product in their own space, and hand
your cart the exact configured SKUs. **3.4 KB gzipped, zero dependencies, TypeScript
definitions included.**

- **Docs:** [docs.togenar.com](https://docs.togenar.com/embed/quick-start/) — quick start, attributes, full SDK reference
- **Live tester:** [Test your embed](https://docs.togenar.com/embed/test-your-embed/) — paste a project ID, verify end to end in the browser
- **Demo:** [`demo.html`](./demo.html) — self-contained reference implementation for any published project

The rest of this page documents the **add-to-cart integration**: passing the configured
product into your own cart, without the shopper leaving your site.

**Division of responsibility.** Togenar delivers the configuration and presentation layer
end to end: the embed, the customization interface, AR, snapshots, share links, and live
stock and price *display*. Your commerce platform remains the system of record for
**cart, checkout, inventory, tax and payment**. The embed returns the configured **SKU**;
a short integration posts it to your existing cart. This page specifies that integration.

---

## 1. Add the embed

```html
<script type="module" src="https://model.togenar.com/embed/togenar-embed.js"></script>

<togenar-embed
  id="tg"
  project="YOUR_PROJECT_ID"
  configurator
  aspect="1/1">
</togenar-embed>
```

Common attributes: `configurator` (enable option picking), `aspect="16/9" | "1/1"` or
`height="520px"`, `lang`, `picker="off"` (hide the built-in panel and drive it from your own
UI — see §5), `mode="launcher"` (device-adaptive AR launcher page instead of the inline viewer).

---

## 2. Add to cart in three steps

The embed emits `togenar:configurator:selection_change` on load **and on every option
change**. Its detail is:

```jsonc
{
  "parts": [
    { "partId": "…", "partLabel": "Body", "variantId": "…", "label": "Walnut",
      "sku": "OSLO-BODY-WALNUT", "modelName": "…" }
  ],
  "shareUrl": "https://model.togenar.com/…"   // deep-link to this exact configuration
}
```

So the pattern is: **wait for a valid selection → enable your button → on click, read the
SKUs and POST them to your cart.**

```html
<togenar-embed id="tg" project="YOUR_PROJECT_ID" configurator aspect="1/1"></togenar-embed>
<button id="add" disabled>Add to cart</button>

<script>
  const tg  = document.getElementById('tg');
  const btn = document.getElementById('add');

  // 1) Enable the button once the shopper has a complete configuration.
  tg.addEventListener('togenar:configurator:selection_change', (e) => {
    const skus = (e.detail.parts || []).map(p => p.sku).filter(Boolean);
    btn.disabled = skus.length === 0;
  });

  // 2) On click, read the current configuration…
  btn.addEventListener('click', async () => {
    const skus     = tg.getSkus();        // ["OSLO-BODY-WALNUT", "OSLO-LEGS-CHROME"]
    const shareUrl = tg.getShareUrl();    // permalink to rebuild this exact config later

    // 3) …and hand it to YOUR store. Replace this with your real cart call (see §4).
    await fetch('/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus, quantity: 1, configuration_url: shareUrl }),
    });
  });
</script>
```

`getSkus()` / `getSelection()` / `getShareUrl()` are **synchronous** reads of the last
`selection_change` — no round-trip. They return `null`/`[]` until the first event arrives, so
always gate your button on the event as shown above.

> **Persist `shareUrl` on the order line.** It rebuilds the shopper's exact configuration
> for order review, fulfillment, or re-order — the one field worth storing beyond the SKUs.

---

## 3. View in their room (AR)

```js
document.getElementById('view-in-ar').addEventListener('click', () => {
  tg.enterAR();   // iOS Quick Look / Android Scene Viewer / WebXR
});
```

Call `enterAR()` **from your own click handler** — starting a WebXR session may require an
in-page user gesture per the browser's activation policy. AR must be enabled on the
workspace plan; on desktop, use `getQr()` for a "scan to view in AR" code.

---

## 4. Concrete: Shopify & WooCommerce

Both platforms add to cart by their **internal variant/product ID, not by SKU.** So the one
real integration task is mapping the Togenar SKU → your platform's ID. That mapping is what the
generic `/cart/add` above stands in for.

### Shopify (AJAX Cart API)

```js
// Map each configured SKU to its Shopify variant ID. Build this map from your product data
// (e.g. window.meta / a metafield / the product JSON) — Shopify's cart API takes IDs, not SKUs.
const SKU_TO_VARIANT = {
  'OSLO-BODY-WALNUT': 40123456789012,
  'OSLO-LEGS-CHROME': 40123456789013,
};

btn.addEventListener('click', async () => {
  const items = tg.getSkus()
    .map(sku => SKU_TO_VARIANT[sku])
    .filter(Boolean)
    .map(id => ({ id, quantity: 1, properties: { _config: tg.getShareUrl() } }));

  await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  // then refresh your cart drawer / redirect to /cart
});
```

For a configured bundle you typically sell **one** parent SKU (map to a single variant) and
stash the full part list + `shareUrl` in line-item `properties`.

### WooCommerce (Store API)

```js
await fetch('/wp-json/wc/store/v1/cart/add-item', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Nonce': wcStoreApiNonce },
  body: JSON.stringify({ id: WC_PRODUCT_ID, quantity: 1 }),
});
```

Resolve `WC_PRODUCT_ID` from the Togenar SKU the same way (SKU → product/variation ID map).

> A turnkey Shopify app / WooCommerce plugin that auto-wires this mapping is on the roadmap.
> Until then, this ~15-line snippet is the whole integration.

---

## 5. Two-way sync (optional but recommended)

Keep the embed in step with your catalogue — all async, all keyed by the **same SKUs/handles**
the events report:

| Method | Purpose |
| --- | --- |
| `setAvailability({ body: { walnut: false } })` | Push live stock. Out-of-stock swatches dim + become unselectable. |
| `setPrices({ currency: 'EUR', locale: 'de-DE', items: { 'OSLO-BODY-WALNUT': 129.9 }, total: 259.8 })` | Show your prices in the summary. The viewer never computes price — **your page stays the pricing source of truth.** |
| `getOptions()` | Enumerate every part + variant (with `select()`-ready handles + `sku`) to build your **own** option panel. Each entry carries `inPicker` — `false` for parts a link group drives — so `filter(o => o.inPicker)` matches the published panel. |
| `select(partKey, variantKey)` | Drive a swap from your own UI. Resolves after the model settles. |
| `reset()` | Back to the published default. |
| `addedToCart(detail?)` | Confirms that your cart call succeeded — call it from your own Add-to-cart handler. On **Android** this is what credits an AR-driven sale: Google allows no button inside AR, and Togenar does not render a second one over yours, so an add that lands immediately after the shopper leaves AR is attributed to that session. |
| `getShareLink()` / `getQr()` / `getSnapshot()` | Short share link, "scan for AR" QR, PNG hero of the current config. |

Headless mode (`picker="off"`) hides the built-in panel so your `getOptions()` + `select()`
UI is the only chrome.

---

## 6. Events reference

Listen with `tg.addEventListener('togenar:<name>', e => …)`:

| Event | When |
| --- | --- |
| `togenar:ready` | Viewer loaded and interactive. |
| `togenar:configurator:selection_change` | On load + every option change. `detail = { parts, shareUrl }`. |
| `togenar:configurator:enquire` | Shopper tapped the summary panel's enquire button (needs the `enquire` attribute). `detail = { parts, skus, shareUrl }`. |
| `togenar:ar-add-to-cart` | Shopper added the configured product to the cart from **inside iOS AR** (enable **AR Add to Cart** per project in WebAR settings). `detail = { surface, arMode, label, projectId }`. Wire it to your cart. Android has no in-AR button — call `addedToCart()` from your own button instead, and the add is credited to the AR session. |
| `togenar:commerce:add_to_cart_success` / `…_fail` | Emitted by the viewer's own commerce flows. To report **your** cart call, use `addedToCart()` above. |
| `togenar:error` | Load/config failure. |

### Conversion attributes

| Attribute | Purpose |
| --- | --- |
| `enquire` | Show the summary panel's enquire button. Off by default — a button with no listener is a dead end. |
| `enquire-label` | Rename it ("Request a quote", "Add to cart", …). |
| `consent="analytics"` | Opt in to configurator funnel analytics (option picks, enquiries). Off by default; **you are the data controller** for it. |

```html
<togenar-embed project="…" configurator enquire enquire-label="Request a quote" consent="analytics"></togenar-embed>
```

```js
tg.addEventListener('togenar:configurator:enquire', (e) => openQuoteForm(e.detail));
```

Because the tap happens **inside** the configurator, it can be attributed — a buy button that lives
outside the 3D player cannot be.

### Presentation attributes

| Attribute | Purpose |
| --- | --- |
| `reflection` | Studio-style ground reflection under the product. Off by default; skipped automatically on heavy or animated models and inside AR. |

---

## 7. Reference implementation

`demo.html` in this folder is a live, self-contained reference build — including a working
**Add to cart** card that shows the exact payload a real store would POST. Open it against a
published project to see the full customize → AR → add-to-cart flow end to end.
