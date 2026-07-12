// Minimal, framework-agnostic embed component for customer websites.
// Strategy: isolate via iframe to avoid CSS/JS conflicts and simplify integration.
// Usage:
//   <script type="module" src="https://model.togenar.com/embed/togenar-embed.js"></script>
//   <togenar-embed project="..." mode="launcher"></togenar-embed>

const DEFAULT_BASE_URL = 'https://model.togenar.com';

const boolAttr = (value) => {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
};

const pick = (v) => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

const encodePathSegments = (p) => {
  try {
    if (typeof p !== 'string') return '';
    return p.split('/').map((s) => encodeURIComponent(s)).join('/');
  } catch {
    return String(p ?? '');
  }
};

const buildViewerUrl = ({
  baseUrl,
  project,
  sceneId,
  model,
  lang,
  configurator,
  headless,
  launcher,
  preview,
  width,
  height,
  sizeHints,
  skipAnalytics,
  arHost,
}) => {
  const base = new URL(baseUrl || DEFAULT_BASE_URL);
  const url = launcher ? new URL('/embed/launcher.html', base) : new URL('/embed/viewer.html', base);

  if (project) url.searchParams.set('project', project);
  if (sceneId) url.searchParams.set('scene_id', sceneId);
  if (model) url.searchParams.set('model', model);
  if (lang) url.searchParams.set('lang', lang);
  if (configurator) url.searchParams.set('configurator', '1');
  // Headless / picker-off: hide the built-in panel so the host's own UI is the only chrome. The
  // viewer still loads the configurator + Host SDK bridge, so the store drives swaps via select().
  if (headless) url.searchParams.set('picker', 'off');
  // Host owns native AR: the SDK launches Quick Look / Scene Viewer from the TOP-LEVEL document
  // (the only context where iOS shows AR mode). Tell the viewer to hide its in-iframe AR button
  // and instead stream ready-to-launch AR URLs up to us. Not for the launcher page (already AR-first).
  if (arHost && !launcher) url.searchParams.set('arhost', '1');
  if (!launcher) url.searchParams.set('embed', '1');
  if (skipAnalytics) url.searchParams.set('na', '1');

  // Owner draft preview: a raw query fragment ("pvexp=..&pvsig=..") forwarded verbatim so the
  // owner can preview an UNPUBLISHED project. Never set for public embeds.
  if (preview) {
    try {
      new URLSearchParams(preview).forEach((value, key) => {
        if (key) url.searchParams.set(key, value);
      });
    } catch {
      /* ignore malformed preview token */
    }
  }
  // Embed mode always uses the dedicated /embed/* entrypoints.

  // Optional sizing hints.
  // IMPORTANT: do not add these by default, because changing element size would change the URL and reload the iframe.
  if (sizeHints) {
    if (width) url.searchParams.set('w', String(width));
    if (height) url.searchParams.set('h', String(height));
  }

  return url.toString();
};

class TogenarEmbed extends HTMLElement {
  static get observedAttributes() {
    return [
      'project',
      'project-id',
      'scene-id',
      'model',
      'lang',
      'locale',
      'mode',
      'launcher',
      'configurator',
      'picker',
      'preview',
      'base-url',
      'allow',
      'loading',
      'aspect',
      'height',
      'size-hints',
      'na',
      'ar-button',
    ];
  }

  #shadow;
  #iframe;
  #status;
  #root;
  #onMessage;
  #expectedOrigin = null;
  #lastSelection = null;   // cached { parts:[{partId,partLabel,variantId,label,sku,modelName}], shareUrl }
  #pending = new Map();    // correlation id -> { resolve, reject, timer, msg, sentEarly } for in-flight requests
  #reqId = 0;              // monotonic request id
  #bridged = false;        // viewer bridge PROVEN reachable (a __togenar message arrived) → safe to post
  #preflight = [];         // request envelopes queued until the bridge is proven (or the fallback fires)
  #fallbackTimer = null;   // last-resort flush for frames that never post messages
  #arLaunch = null;        // cached { hasAr, iosHref, androidIntent, androidFallback, arSupportEnabled } from the viewer
  #arBtn = null;           // top-level AR button (host document) — the ONLY context iOS Quick Look shows AR mode

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; width: 100%; --togenar-embed-bg: transparent; }
      .wrap {
        position: relative;
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
        background: var(--togenar-embed-bg, transparent);
      }
      .ratio { width: 100%; }
      .ratio::before { content: ""; display: block; padding-top: var(--ratio, 56.25%); }
      .frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
      }
      .status {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.85);
        font: 500 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        pointer-events: none;
        letter-spacing: .2px;
      }
      .spinner {
        width: 22px;
        height: 22px;
        border: 2px solid rgba(255,255,255,0.18);
        border-top-color: rgba(255,255,255,0.75);
        border-radius: 999px;
        animation: spin 800ms linear infinite;
        margin-right: 10px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .row { display: flex; align-items: center; }
      .ar-btn {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 9px 14px;
        border: 0;
        border-radius: 999px;
        background: rgba(20,20,22,0.88);
        color: #fff;
        font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        letter-spacing: .2px;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.24);
        -webkit-backdrop-filter: blur(6px);
        backdrop-filter: blur(6px);
      }
      .ar-btn:hover { background: #111; }
      .ar-btn svg { width: 18px; height: 18px; flex: 0 0 auto; }
    `;

    this.#root = document.createElement('div');
    this.#root.className = 'wrap';

    const ratio = document.createElement('div');
    ratio.className = 'ratio';

    this.#iframe = document.createElement('iframe');
    this.#iframe.className = 'frame';
    {
      const loadingAttr = this.getAttribute('loading');
      this.#iframe.loading = loadingAttr === 'eager' ? 'eager' : 'lazy';
    }
    this.#iframe.referrerPolicy = 'strict-origin-when-cross-origin';

    // Permissions needed for AR/3D viewer in iframe.
    // WebXR in iframes requires allow="xr-spatial-tracking" (Chrome).
    // Fullscreen is often needed for good UX.
    const allow = this.getAttribute('allow') || 'xr-spatial-tracking; fullscreen; camera; accelerometer; gyroscope';
    this.#iframe.setAttribute('allow', allow);

    this.#status = document.createElement('div');
    this.#status.className = 'status';
    this.#status.innerHTML = `<div class="row"><span class="spinner"></span></div>`;
    this.#status.style.display = 'none';

    // Top-level AR button. It lives in the host document (shadow DOM of this element, NOT the
    // cross-origin iframe), so tapping it launches native AR within a real top-level user gesture —
    // the only way iOS Quick Look shows AR (camera) mode. Hidden until the viewer reports AR URLs.
    this.#arBtn = document.createElement('button');
    this.#arBtn.type = 'button';
    this.#arBtn.className = 'ar-btn';
    this.#arBtn.setAttribute('part', 'ar-button');
    this.#arBtn.style.display = 'none';
    this.#arBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg><span>AR</span>';
    this.#arBtn.addEventListener('click', (e) => { try { e.preventDefault(); } catch {} try { this.enterAR(); } catch {} });

    this.#root.appendChild(ratio);
    this.#root.appendChild(this.#iframe);
    this.#root.appendChild(this.#status);
    this.#root.appendChild(this.#arBtn);

    this.#shadow.appendChild(style);
    this.#shadow.appendChild(this.#root);

    this.#iframe.addEventListener('load', () => {
      // If the iframe loads, hide status. If project is invalid, viewer itself will show error UI.
      this.#status.style.display = 'none';
      // Do NOT flush queued requests here: 'load' fires when the static shell parses, but the
      // viewer bridge (main.js) is dynamically imported AFTER that — a message posted now is
      // silently lost. Wait for bridge proof (#markBridged); arm a timer flush as a last resort
      // for frames that never post messages.
      this.#armFallbackFlush();
      this.dispatchEvent(new CustomEvent('togenar:load', { bubbles: true }));
    });

    this.#onMessage = (event) => {
      try {
        if (!event) return;
        if (!this.#iframe || event.source !== this.#iframe.contentWindow) return;
        if (this.#expectedOrigin && event.origin && event.origin !== this.#expectedOrigin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        const record = data;
        if (record.__togenar !== 1) return;

        // Any authenticated viewer message proves the bridge is listening.
        this.#markBridged();

        // Correlated response to a request() — resolve/reject the pending promise, not an event.
        if (record.type === 'response') { this.#resolveResponse(record); return; }

        const name = typeof record.event === 'string' ? record.event.trim() : '';
        if (!name) return;

        // Hide loader on ready (more reliable than iframe load).
        if (name === 'ready') {
          try { this.#status.style.display = 'none'; } catch {}
        }

        // Cache the configurator selection so getSelection()/getShareUrl() are synchronous pulls
        // (no round-trip): the viewer emits this on mount and on every pick, so the cache is current.
        if (name === 'configurator:selection_change') {
          this.#lastSelection = record.detail ?? null;
        }

        // Cache native-AR launch URLs streamed by the viewer (embed + ?arhost=1). enterAR() / the AR
        // button fire these from the top-level document WITHIN the tap — no round-trip, no lost gesture.
        if (name === 'ar-urls') {
          this.#arLaunch = record.detail ?? null;
          try { this.#updateArButton(); } catch {}
        }

        this.dispatchEvent(new CustomEvent(`togenar:${name}`.replace('::', ':'), {
          bubbles: true,
          detail: record.detail ?? {},
        }));
      } catch {}
    };
  }

  connectedCallback() {
    this.#applySizing();
    try { window.removeEventListener('message', this.#onMessage); } catch {}

    try { window.addEventListener('message', this.#onMessage); } catch {}
    this.#sync();
  }

  disconnectedCallback() {
    try { window.removeEventListener('message', this.#onMessage); } catch {}
    // Fail any in-flight requests so callers don't hang on a removed embed.
    try { for (const [, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(new Error('togenar: embed disconnected')); } } catch {}
    this.#pending.clear();
    this.#preflight.length = 0;
    if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    this.#bridged = false;
  }

  attributeChangedCallback() {
    // Re-render URL / sizing on any change.
    if (!this.isConnected) return;
    this.#applySizing();
    this.#sync();
    try { this.#updateArButton(); } catch {}
  }

  #applySizing() {
    // Options:
    // - aspect="16/9" or aspect="1/1"
    // - height="520px" (fixed)
    const aspect = pick(this.getAttribute('aspect'));
    const height = pick(this.getAttribute('height'));

    if (height) {
      this.#root.style.height = height;
      this.#root.style.setProperty('--ratio', '0%');
      const ratioEl = this.#shadow.querySelector('.ratio');
      if (ratioEl) ratioEl.style.display = 'none';
      return;
    }

    const ratioEl = this.#shadow.querySelector('.ratio');
    if (ratioEl) ratioEl.style.display = '';
    this.#root.style.height = '';

    let ratio = 56.25; // 16:9
    const normAspect = aspect ? aspect.replace(/:/g, '/') : aspect;
    if (normAspect && normAspect.includes('/')) {
      const [a, b] = normAspect.split('/').map((x) => Number(String(x).trim()));
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        ratio = (b / a) * 100;
      }
    }
    this.#root.style.setProperty('--ratio', `${ratio}%`);
  }

  #sync() {
    const baseUrl = pick(this.getAttribute('base-url'));

    const project = pick(this.getAttribute('project')) || pick(this.getAttribute('project-id'));
    const sceneId = pick(this.getAttribute('scene-id'));

    const rawModel = pick(this.getAttribute('model'));
    const model = rawModel ? encodePathSegments(rawModel) : null;

    const lang = pick(this.getAttribute('lang')) || pick(this.getAttribute('locale'));

    const mode = (pick(this.getAttribute('mode')) || '').toLowerCase();
    const launcherFromMode = mode === 'launcher' || mode === 'ar-launcher';
    const launcherFromAttr = boolAttr(this.getAttribute('launcher'));
    const launcher = launcherFromMode || launcherFromAttr;

    const configurator = boolAttr(this.getAttribute('configurator'));
    // Headless / picker-off: the host renders its own option UI. `picker="off|none|false"` or
    // `mode="headless"` suppresses the built-in panel; the configurator + Host SDK still load.
    const pickerAttr = (pick(this.getAttribute('picker')) || '').toLowerCase();
    const headless = mode === 'headless' || pickerAttr === 'off' || pickerAttr === 'none' || pickerAttr === 'false';
    const preview = pick(this.getAttribute('preview'));

    const sizeHints = boolAttr(this.getAttribute('size-hints'));
    const skipAnalytics = boolAttr(this.getAttribute('na'));

    if (!project) {
      this.#status.style.display = 'none';
      return;
    }

    const url = buildViewerUrl({
      baseUrl,
      project,
      sceneId,
      model,
      lang,
      configurator,
      headless,
      launcher,
      preview,
      width: this.clientWidth || null,
      height: this.clientHeight || null,
      sizeHints,
      skipAnalytics,
      // Inline viewer/configurator embeds: the SDK owns native AR from the top level.
      arHost: !launcher,
    });

    // Only show loader if we're actually going to reload the iframe.
    // Important: attributeChangedCallback can call #sync() for non-URL-affecting changes;
    // showing the spinner in that case creates a false "Loading 3D…" overlay.
    if (this.#iframe.src !== url) {
      this.#status.style.display = 'none';

      // New document → the bridge must prove itself again before we post into the frame.
      this.#bridged = false;
      if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }

      this.#iframe.src = url;
      try { this.#expectedOrigin = new URL(url).origin; } catch { this.#expectedOrigin = null; }
    }
  }

  // ── Host Embed SDK: inbound control (correlated request/response) ──────────────────────────────
  // The bridge counts as reachable only once a __togenar message arrives FROM the viewer: iframe
  // 'load' is too early (main.js is dynamically imported after the shell parses), so a request
  // posted on 'load' can vanish. On proof: re-send anything a fallback flush may have posted into
  // the void (responses correlate by id, so a duplicate answer is ignored), then flush the queue.
  #markBridged() {
    if (this.#bridged) return;
    this.#bridged = true;
    if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    for (const [, entry] of this.#pending) {
      if (entry.sentEarly) { entry.sentEarly = false; this.#send(entry.msg); }
    }
    const queued = this.#preflight.splice(0);
    for (const msg of queued) this.#send(msg);
  }

  // Last resort for frames that never post messages (e.g. the AR launcher page): flush queued
  // requests after a grace period anyway, but mark them so #markBridged() re-sends them if the
  // bridge does show up later.
  #armFallbackFlush() {
    if (this.#bridged || this.#fallbackTimer) return;
    this.#fallbackTimer = setTimeout(() => {
      this.#fallbackTimer = null;
      if (this.#bridged) return;
      const queued = this.#preflight.splice(0);
      for (const msg of queued) {
        const entry = this.#pending.get(msg.id);
        if (entry) entry.sentEarly = true;
        this.#send(msg);
      }
    }, 8000);
  }

  // Low-level post of a request envelope into the iframe (no-op if the frame isn't reachable yet).
  #send(msg) {
    try { const win = this.#iframe && this.#iframe.contentWindow; if (win) win.postMessage(msg, this.#expectedOrigin || '*'); } catch { /* frame gone */ }
  }

  // Send a correlated request and return a Promise that resolves with the viewer's result (or rejects
  // on error / timeout). Requests issued before the bridge is proven are queued and flushed on proof.
  #request(method, params = {}, timeoutMs = 30000) {
    const id = ++this.#reqId;
    const msg = { __togenar: 1, type: 'request', id, method, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#pending.has(id)) { this.#pending.delete(id); reject(new Error(`togenar: ${method}() timed out`)); }
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, msg, sentEarly: false });
      if (this.#bridged) this.#send(msg); else this.#preflight.push(msg);
    });
  }

  // Resolve/reject the pending promise for a { type:'response', id, ok, result, error } message.
  #resolveResponse(record) {
    const entry = this.#pending.get(record.id);
    if (!entry) return;
    this.#pending.delete(record.id);
    try { clearTimeout(entry.timer); } catch {}
    if (record.ok) entry.resolve(record.result ?? null);
    else entry.reject(new Error(record.error || 'togenar: request failed'));
  }

  // ── Public API for the merchant's page ─────────────────────────────────────────────────────────
  /**
   * Current configuration: { parts: [{ partId, partLabel, variantId, label, sku, modelName }], shareUrl }.
   * Cached from the viewer's selection_change event (emitted on load + every change). Returns null
   * until the first event arrives — listen for 'togenar:configurator:selection_change' to know when.
   */
  getSelection() {
    return this.#lastSelection;
  }

  /** Shareable deep-link URL for the current configuration (or null until the first selection event). */
  getShareUrl() {
    return (this.#lastSelection && this.#lastSelection.shareUrl) || null;
  }

  /** The SKUs of the current configuration (one per configurable part), for the cart payload. */
  getSkus() {
    const parts = (this.#lastSelection && Array.isArray(this.#lastSelection.parts)) ? this.#lastSelection.parts : [];
    return parts.map((p) => p && p.sku).filter(Boolean);
  }

  /**
   * Enumerate every part + ALL its variants with select()-ready url handles, so the host can build its
   * own option panel without re-deriving slugs. Async (round-trips to the viewer); resolves to
   * [{ partId, partKey, label, defaultVariantId, variants:[{ variantId, handle, label, sku, swatch,
   * swatchImage, modelName, isDefault }] }].
   */
  getOptions() {
    return this.#request('getOptions');
  }

  /**
   * Drive a selection from the store's own UI. Keys are the URL handles (the value after ?part=…),
   * e.g. select('body', 'walnut'). Async: resolves with { ok, selection } AFTER the model swap
   * settles (so you can update the cart on completion); rejects on an unknown handle / timeout.
   */
  select(partKey, variantKey) {
    return this.#request('select', { partKey, variantKey });
  }

  /** Reset the configuration to the published default. Async: resolves with { ok, selection }. */
  reset() {
    return this.#request('reset');
  }

  /**
   * Push live stock from the store. Keys are the SAME handles getOptions() returns:
   *   setAvailability({ body: { walnut: false, oak: true }, ... })   // false = out of stock
   * Out-of-stock swatches are dimmed + struck through and become unselectable in the built-in picker,
   * and getOptions() then reports each variant's `available`. Async: resolves with { ok, applied }.
   */
  setAvailability(availability) {
    return this.#request('setAvailability', { availability });
  }

  /**
   * Push price DISPLAY from the store's own catalogue. Keys are the SAME SKUs selection_change /
   * getSkus() report, so you round-trip your own identifiers:
   *   setPrices({ currency: 'EUR', locale: 'de-DE', items: { 'SKU-1': 129.9 }, total: 259.8 })
   * Numbers are Intl-formatted with currency/locale; string values are shown verbatim (pre-format
   * them yourself); total is optional (auto-summed when every shown price is numeric). Prices appear
   * in the viewer's "View summary" modal. Pass null to clear. The viewer never computes prices —
   * your page stays the single source of pricing truth. Async: resolves with { ok, applied }.
   */
  setPrices(prices) {
    return this.#request('setPrices', { prices });
  }

  /** Ease the camera back to its opening framing. Async: resolves with { ok }. */
  resetCamera() {
    return this.#request('resetCamera');
  }

  /**
   * Launch native AR for the CURRENT configuration from the HOST's top-level document — iOS Quick
   * Look (rel="ar" anchor) / Android Scene Viewer (intent) / desktop → device-adaptive launcher tab.
   *
   * MUST be called synchronously inside your own click/tap handler: the launch fires within that
   * user gesture (URLs are pre-cached from the viewer's `ar-urls` stream, so there is no round-trip
   * to consume the activation). Returns a resolved Promise with { ok, method } — the DOM action has
   * already happened by the time it resolves.
   */
  enterAR() {
    const ar = this.#arLaunch || null;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
    const isAndroid = /Android/i.test(ua);
    try {
      if (ar && ar.arSupportEnabled === false) return Promise.resolve({ ok: false, reason: 'ar-disabled' });

      // iOS Quick Look — the rel="ar" anchor MUST be in the top-level document for AR (camera) mode.
      if (isIOS && ar && ar.iosHref) {
        const a = document.createElement('a');
        a.rel = 'ar';
        a.href = ar.iosHref;
        // Quick Look is most reliable when the anchor has a child <img> (may be empty).
        const img = document.createElement('img');
        img.decoding = 'async';
        img.alt = '';
        a.appendChild(img);
        document.body.appendChild(a);
        a.click();
        try { a.remove(); } catch {}
        return Promise.resolve({ ok: true, method: 'quicklook' });
      }

      // Android Scene Viewer — intent navigation from the top-level document.
      if (isAndroid && ar && ar.androidIntent) {
        try { window.location.href = ar.androidIntent; } catch {}
        return Promise.resolve({ ok: true, method: 'scene-viewer' });
      }

      // Desktop, or URLs not streamed yet → open the device-adaptive launcher (QR-to-phone) in a new
      // tab (still inside this gesture, so the popup is allowed).
      const launcher = this.#launcherUrl();
      if (launcher) {
        try { window.open(launcher, '_blank', 'noopener,noreferrer'); } catch {}
        return Promise.resolve({ ok: true, method: 'launcher-tab' });
      }
      return Promise.resolve({ ok: false, reason: 'no-ar-url' });
    } catch (e) {
      return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
    }
  }

  /** True when native AR is available for the current configuration (viewer reported launch URLs). */
  isArAvailable() {
    const ar = this.#arLaunch;
    return !!(ar && ar.hasAr && ar.arSupportEnabled !== false);
  }

  // Show/hide the built-in AR button from the cached AR state + the `ar-button` attribute
  // ("off"/"none"/"false"/"0" → host provides its own button and calls enterAR()).
  #updateArButton() {
    if (!this.#arBtn) return;
    const attr = String(this.getAttribute('ar-button') || '').trim().toLowerCase();
    const off = attr === 'off' || attr === 'none' || attr === 'false' || attr === '0';
    const show = !off && this.isArAvailable();
    this.#arBtn.style.display = show ? 'inline-flex' : 'none';
  }

  // Synchronous device-adaptive launcher URL (QR/scan flow) for the desktop / not-yet-ready fallback.
  #launcherUrl() {
    try {
      const base = pick(this.getAttribute('base-url')) || DEFAULT_BASE_URL;
      const project = pick(this.getAttribute('project')) || pick(this.getAttribute('project-id'));
      if (!project) return null;
      const u = new URL('/embed/launcher.html', new URL(base));
      u.searchParams.set('project', project);
      const lang = pick(this.getAttribute('lang')) || pick(this.getAttribute('locale'));
      if (lang) u.searchParams.set('lang', lang);
      u.searchParams.set('launcherFrom', 'viewer');
      return u.toString();
    } catch {
      return null;
    }
  }

  /**
   * PNG data-URL snapshot of the currently-configured model (the summary hero image).
   * Async: resolves { ok, url } — best-effort, ok:false when capture is unavailable.
   */
  getSnapshot() {
    return this.#request('getSnapshot');
  }

  /**
   * Short device-adaptive share link (…/s/{code}) for the current configuration — the same link the
   * built-in summary's Share box and QR encode. Async: resolves { ok, url } (full launcher URL fallback).
   */
  getShareLink() {
    return this.#request('getShareLink');
  }

  /**
   * QR PNG data-URL for the desktop "scan to view in AR" flow. Defaults to the short share link;
   * pass { text, size } to encode something else. Async: resolves { ok, url }.
   */
  getQr(params) {
    return this.#request('getQr', params || {});
  }
}

if (!customElements.get('togenar-embed')) {
  customElements.define('togenar-embed', TogenarEmbed);
}

export { TogenarEmbed };
