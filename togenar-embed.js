
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
  behaviouralConsent,
  enquire,
  enquireLabel,
  reflection,
  arHost,
  pageUrl,
}) => {
  const base = new URL(baseUrl || DEFAULT_BASE_URL);
  const url = launcher ? new URL('/embed/launcher.html', base) : new URL('/embed/viewer.html', base);

  if (project) url.searchParams.set('project', project);
  if (sceneId) url.searchParams.set('scene_id', sceneId);
  if (model) url.searchParams.set('model', model);
  if (lang) url.searchParams.set('lang', lang);
  if (configurator) url.searchParams.set('configurator', '1');
  if (headless) url.searchParams.set('picker', 'off');
  if (arHost && !launcher) url.searchParams.set('arhost', '1');
  if (!launcher) url.searchParams.set('embed', '1');
  if (skipAnalytics) url.searchParams.set('na', '1');
  if (behaviouralConsent) url.searchParams.set('consent', '1');
  if (enquire) {
    url.searchParams.set('enquire', '1');
    if (enquireLabel) url.searchParams.set('enquire_label', enquireLabel);
  }
  if (reflection) url.searchParams.set('reflection', '1');
  if (pageUrl) url.searchParams.set('page', pageUrl);

  if (preview) {
    try {
      new URLSearchParams(preview).forEach((value, key) => {
        if (key) url.searchParams.set(key, value);
      });
    } catch {
    }
  }

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
      'consent',
      'enquire',
      'enquire-label',
      'reflection',
      'ar-button',
      'page-url',
    ];
  }

  #shadow;
  #iframe;
  #status;
  #root;
  #onMessage;
  #expectedOrigin = null;
  #lastSelection = null;
  #pending = new Map();
  #reqId = 0;
  #bridged = false;
  #preflight = [];
  #fallbackTimer = null;
  #arLaunch = null;
  #arBtn = null;
  #arBusyCleanup = null;
  #arAutoLaunchUntil = 0;

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
      .ar-btn.busy { pointer-events: none; opacity: 0.85; }
      .ar-btn.busy svg { display: none; }
      .ar-btn .ar-spin {
        display: none;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255,255,255,0.35);
        border-top-color: rgba(255,255,255,0.9);
        border-radius: 999px;
        animation: spin 800ms linear infinite;
        flex: 0 0 auto;
      }
      .ar-btn.busy .ar-spin { display: inline-block; }
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

    const allow = this.getAttribute('allow') || 'xr-spatial-tracking; fullscreen; camera; accelerometer; gyroscope';
    this.#iframe.setAttribute('allow', allow);

    this.#status = document.createElement('div');
    this.#status.className = 'status';
    this.#status.innerHTML = `<div class="row"><span class="spinner"></span></div>`;
    this.#status.style.display = 'none';

    this.#arBtn = document.createElement('button');
    this.#arBtn.type = 'button';
    this.#arBtn.className = 'ar-btn';
    this.#arBtn.setAttribute('part', 'ar-button');
    this.#arBtn.style.display = 'none';
    this.#arBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg><span class="ar-spin" aria-hidden="true"></span><span>AR</span>';
    this.#arBtn.addEventListener('click', (e) => { try { e.preventDefault(); } catch {} try { this.enterAR(); } catch {} });

    this.#root.appendChild(ratio);
    this.#root.appendChild(this.#iframe);
    this.#root.appendChild(this.#status);
    this.#root.appendChild(this.#arBtn);

    this.#shadow.appendChild(style);
    this.#shadow.appendChild(this.#root);

    this.#iframe.addEventListener('load', () => {
      this.#status.style.display = 'none';
      this.#armFallbackFlush();
      this.#sendHostAttribution();
      this.dispatchEvent(new CustomEvent('togenar:load', { bubbles: true }));
    });

    this.#onMessage = (event) => {
      try {
        if (!event) return;
        if (!this.#iframe || event.source !== this.#iframe.contentWindow) return;
        if (!this.#expectedOrigin || event.origin !== this.#expectedOrigin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        const record = data;
        if (record.__togenar !== 1) return;

        this.#markBridged();

        if (record.type === 'response') { this.#resolveResponse(record); return; }

        const name = typeof record.event === 'string' ? record.event.trim() : '';
        if (!name) return;

        if (name === 'ready') {
          try { this.#status.style.display = 'none'; } catch {}
        }

        if (name === 'configurator:selection_change') {
          this.#lastSelection = record.detail ?? null;
        }

        if (name === 'ar-urls') {
          this.#arLaunch = record.detail ?? null;
          try { this.#updateArButton(); } catch {}
          try { this.#maybeAutoLaunchAr(); } catch {}
        }

        if (name === 'ar-prepare-failed') {
          try { this.#clearArBusy(); } catch {}
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
    try { this.#clearArBusy(); } catch {}
    try { for (const [, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(new Error('togenar: embed disconnected')); } } catch {}
    this.#pending.clear();
    this.#preflight.length = 0;
    if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    this.#bridged = false;
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.#applySizing();
    this.#sync();
    try { this.#updateArButton(); } catch {}
  }

  #applySizing() {
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

    let ratio = 56.25;
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
    const pickerAttr = (pick(this.getAttribute('picker')) || '').toLowerCase();
    const headless = mode === 'headless' || pickerAttr === 'off' || pickerAttr === 'none' || pickerAttr === 'false';
    const preview = pick(this.getAttribute('preview'));

    const sizeHints = boolAttr(this.getAttribute('size-hints'));
    const skipAnalytics = boolAttr(this.getAttribute('na'));
    const enquire = boolAttr(this.getAttribute('enquire'));
    const enquireLabel = pick(this.getAttribute('enquire-label'));
    const reflection = boolAttr(this.getAttribute('reflection'));

    const behaviouralConsent = (() => {
      const raw = this.getAttribute('consent');
      if (raw === null) return false;
      const value = String(raw).trim().toLowerCase();
      return value === '' || value === 'analytics' || value === 'true' || value === '1' || value === 'granted';
    })();

    const pageUrl = (() => {
      const explicit = pick(this.getAttribute('page-url'));
      const raw = explicit || (typeof window !== 'undefined' && window.location ? window.location.href : '');
      if (!raw) return null;
      try {
        const u = new URL(raw, window.location.href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        u.hash = '';
        const s = u.toString();
        return s.length > 2000 ? null : s;
      } catch {
        return null;
      }
    })();

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
      behaviouralConsent,
      enquire,
      enquireLabel,
      reflection,
      arHost: !launcher,
      pageUrl,
    });

    if (this.#iframe.src !== url) {
      this.#status.style.display = 'none';

      this.#bridged = false;
      if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
      this.#arLaunch = null;
      this.#lastSelection = null;
      try { this.#clearArBusy(); } catch {}
      try { this.#updateArButton(); } catch {}

      this.#iframe.src = url;
      try { this.#expectedOrigin = new URL(url).origin; } catch { this.#expectedOrigin = null; }
    }
  }

  getAttribution() {
    try {
      const params = new URLSearchParams((window.location && window.location.search) || '');
      const pick = (key) => String(params.get(key) || '').trim().slice(0, 96);
      return {
        utm_source: pick('utm_source'),
        utm_medium: pick('utm_medium'),
        utm_campaign: pick('utm_campaign'),
        referrer: String((typeof document !== 'undefined' && document.referrer) || '').slice(0, 512),
      };
    } catch {
      return { utm_source: '', utm_medium: '', utm_campaign: '', referrer: '' };
    }
  }

  #sendHostAttribution() {
    try { this.#command('host-attribution', this.getAttribution()); } catch { }
  }

  #markBridged() {
    if (this.#bridged) return;
    this.#bridged = true;
    if (this.#fallbackTimer) { clearTimeout(this.#fallbackTimer); this.#fallbackTimer = null; }
    for (const [, entry] of this.#pending) {
      if (entry.sentEarly) { entry.sentEarly = false; this.#send(entry.msg); }
    }
    const queued = this.#preflight.splice(0);
    for (const msg of queued) this.#send(msg);
    this.#sendHostAttribution();
  }

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

  #send(msg) {
    const targetOrigin = this.#expectedOrigin;
    if (!targetOrigin) return;
    try { const win = this.#iframe && this.#iframe.contentWindow; if (win) win.postMessage(msg, targetOrigin); } catch {  }
  }

  #command(command, args = {}) {
    this.#send({ __togenar: 1, type: 'command', command, args: args || {} });
  }

  #emitArCtaTap(detail) {
    this.dispatchEvent(new CustomEvent('togenar:ar-add-to-cart', { bubbles: true, detail }));
    this.#command('ar-add-to-cart', detail);
  }

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

  #resolveResponse(record) {
    const entry = this.#pending.get(record.id);
    if (!entry) return;
    this.#pending.delete(record.id);
    try { clearTimeout(entry.timer); } catch {}
    if (record.ok) entry.resolve(record.result ?? null);
    else entry.reject(new Error(record.error || 'togenar: request failed'));
  }

  getSelection() {
    return this.#lastSelection;
  }

  getShareUrl() {
    return (this.#lastSelection && this.#lastSelection.shareUrl) || null;
  }

  getSkus() {
    const parts = (this.#lastSelection && Array.isArray(this.#lastSelection.parts)) ? this.#lastSelection.parts : [];
    return parts.map((p) => p && p.sku).filter(Boolean);
  }

  getOptions() {
    return this.#request('getOptions');
  }

  getGroups() {
    return this.#request('getGroups');
  }

  select(partKey, variantKey) {
    return this.#request('select', { partKey, variantKey });
  }

  /**
   * Set the open/closed state of an option that opens or closes the model (a door, a drawer).
   * `getOptions()` reports which variant carries one and where it currently stands.
   */
  setAnimationState(partKey, open) {
    return this.#request('setAnimationState', { partKey, open: open === true });
  }

  showPart(partKey) {
    return this.#request('showPart', { partKey });
  }

  reset() {
    return this.#request('reset');
  }

  setAvailability(availability) {
    return this.#request('setAvailability', { availability });
  }

  setPrices(prices) {
    return this.#request('setPrices', { prices });
  }

  resetCamera() {
    return this.#request('resetCamera');
  }

  /**
   * Tell the viewer which part the shopper is looking at, so the camera angle recorded for that
   * part is applied. Call it when your own panel changes section, not when a swatch is picked:
   * comparing two finishes of the same part must not move the camera. Pass null on a section that
   * is not a part (a summary, a size) to ease back to the opening framing. Whether the camera moves
   * at all is the project's setting; a part with no recorded angle returns to the opening framing.
   */
  focusPart(partKey) {
    return this.#request('focusPart', { partKey: partKey == null ? null : String(partKey) });
  }

  addedToCart(detail = {}) {
    this.#command('added-to-cart', detail || {});
  }

  purchased(detail = {}) {
    this.#command('purchased', detail || {});
  }

  #platform() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
    const isAndroid = /Android/i.test(ua);
    const iosNamedBrowser = /(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
    const safariFamily = (() => {
      try {
        if (window.TelegramWebviewProxy || window.TelegramWebview) return false;
        if (window.webkit && window.webkit.messageHandlers) return false;
        return typeof navigator.standalone !== 'undefined';
      } catch { return false; }
    })();
    const iosSafariAnchor = safariFamily
      && /Version\/[\d.]+/i.test(ua) && /Safari\//i.test(ua)
      && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|Telegram|Instagram|FBAN|FBAV|FB_IAB|Line|MicroMessenger|WhatsApp|Snapchat|TikTok|Pinterest|LinkedIn|Slack)/i.test(ua);
    return { ua, isIOS, isAndroid, iosNamedBrowser, iosSafariAnchor };
  }

  #armInAppSafariEscape(delayMs = 2500) {
    let hidden = false;
    const onVis = () => {
      try { if (document.visibilityState === 'hidden') hidden = true; } catch {}
    };
    try { document.addEventListener('visibilitychange', onVis); } catch {}
    setTimeout(() => {
      try { document.removeEventListener('visibilitychange', onVis); } catch {}
      if (hidden) return;
      try {
        const here = String(window.location.href || '');
        if (/^https:\/\//i.test(here)) window.location.href = here.replace(/^https:\/\//i, 'x-safari-https://');
      } catch {}
    }, delayMs);
  }

  #setArBusy(failsafeMs = 45000) {
    this.#clearArBusy();
    const btn = this.#arBtn;
    if (!btn) return;
    btn.classList.add('busy');
    btn.disabled = true;
    let wasHidden = false;
    const onVis = () => {
      try {
        if (document.visibilityState === 'hidden') { wasHidden = true; return; }
      } catch {}
      if (wasHidden) this.#clearArBusy();
    };
    const timer = setTimeout(() => this.#clearArBusy(), failsafeMs);
    try { document.addEventListener('visibilitychange', onVis); } catch {}
    this.#arBusyCleanup = () => {
      try { clearTimeout(timer); } catch {}
      try { document.removeEventListener('visibilitychange', onVis); } catch {}
      try { btn.classList.remove('busy'); btn.disabled = false; } catch {}
    };
  }

  #clearArBusy() {
    this.#arAutoLaunchUntil = 0;
    const fn = this.#arBusyCleanup;
    this.#arBusyCleanup = null;
    if (fn) { try { fn(); } catch {} }
  }

  #maybeAutoLaunchAr() {
    if (!this.#arAutoLaunchUntil) return;
    if (Date.now() > this.#arAutoLaunchUntil) { this.#clearArBusy(); return; }
    const ar = this.#arLaunch;
    if (!ar || ar.arSupportEnabled === false) { this.#clearArBusy(); return; }
    const { isIOS, isAndroid, iosNamedBrowser, iosSafariAnchor } = this.#platform();
    const url = isIOS ? ar.iosHref : (isAndroid ? ar.androidIntent : null);
    if (!url) return;
    this.#arAutoLaunchUntil = 0;
    if (isAndroid && ar.arCta) { try { this.#command('ar-launched', { method: 'scene-viewer' }); } catch {} }
    if (isIOS && !iosSafariAnchor && !iosNamedBrowser) this.#armInAppSafariEscape();
    try { window.location.href = url; } catch {}
  }

  enterAR() {
    const ar = this.#arLaunch || null;
    const { isIOS, isAndroid, iosNamedBrowser, iosSafariAnchor } = this.#platform();
    try {
      if (ar && ar.arSupportEnabled === false) return Promise.resolve({ ok: false, reason: 'ar-disabled' });

      if (isIOS && ar && ar.iosHref && !iosSafariAnchor) {
        this.#setArBusy(120000);
        if (!iosNamedBrowser) {
          let escaped = false;
          try {
            const here = String(window.location.href || '');
            if (/^https:\/\//i.test(here)) {
              window.location.href = here.replace(/^https:\/\//i, 'x-safari-https://');
              escaped = true;
            }
          } catch {}
          const href = ar.iosHref;
          setTimeout(() => {
            try { if (document.visibilityState === 'hidden') return; } catch {}
            try { window.location.href = href; } catch {}
          }, escaped ? 2000 : 0);
          return Promise.resolve({ ok: true, method: escaped ? 'safari-escape' : 'quicklook-navigate' });
        }
        try { window.location.href = ar.iosHref; } catch {}
        return Promise.resolve({ ok: true, method: 'quicklook-navigate' });
      }

      if (isIOS && ar && ar.iosHref) {
        this.#setArBusy();
        const a = document.createElement('a');
        a.rel = 'ar';
        a.href = ar.iosHref;
        const img = document.createElement('img');
        img.decoding = 'async';
        img.alt = '';
        a.appendChild(img);

        const ctaLabel = (ar.arCta && typeof ar.arCta.label === 'string') ? ar.arCta.label.trim() : '';
        if (ctaLabel) {
          a.style.display = 'none';
          let tapped = false;
          a.addEventListener('message', (event) => {
            if (!event || event.data !== '_apple_ar_quicklook_button_tapped' || tapped) return;
            tapped = true;
            this.#emitArCtaTap({
              surface: 'quicklook',
              arMode: 'quicklook',
              label: ctaLabel,
              projectId: String(this.getAttribute('project') || ''),
            });
          }, false);
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { try { a.remove(); } catch {} }, 1800000);
          return Promise.resolve({ ok: true, method: 'quicklook' });
        }

        document.body.appendChild(a);
        a.click();
        try { a.remove(); } catch {}
        return Promise.resolve({ ok: true, method: 'quicklook' });
      }

      if (isAndroid && ar && ar.androidIntent) {
        if (ar.arCta) { try { this.#command('ar-launched', { method: 'scene-viewer' }); } catch {} }
        this.#setArBusy();
        try { window.location.href = ar.androidIntent; } catch {}
        return Promise.resolve({ ok: true, method: 'scene-viewer' });
      }

      if (isIOS || isAndroid) {
        this.#setArBusy(90000);
        this.#arAutoLaunchUntil = Date.now() + 90000;
        try { this.#command('prepare-ar', {}); } catch {}
        return Promise.resolve({ ok: true, method: 'preparing' });
      }

      const launcher = this.#launcherUrl();
      if (launcher) {
        let opened = null;
        try { opened = window.open(launcher, '_blank'); } catch {}
        if (opened) { try { opened.opener = null; } catch {} }
        return Promise.resolve({ ok: true, method: 'launcher-tab' });
      }
      return Promise.resolve({ ok: false, reason: 'no-ar-url' });
    } catch (e) {
      return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
    }
  }

  isArAvailable() {
    const ar = this.#arLaunch;
    return !!(ar && ar.hasAr && ar.arSupportEnabled !== false);
  }

  #updateArButton() {
    if (!this.#arBtn) return;
    const attr = String(this.getAttribute('ar-button') || '').trim().toLowerCase();
    const off = attr === 'off' || attr === 'none' || attr === 'false' || attr === '0';
    const show = !off && this.isArAvailable();
    this.#arBtn.style.display = show ? 'inline-flex' : 'none';
  }

  #launcherUrl() {
    const streamed = this.#arLaunch && typeof this.#arLaunch.launcherUrl === 'string'
      ? this.#arLaunch.launcherUrl.trim()
      : '';
    if (streamed) return streamed;
    try {
      const base = pick(this.getAttribute('base-url')) || DEFAULT_BASE_URL;
      const project = pick(this.getAttribute('project')) || pick(this.getAttribute('project-id'));
      if (!project) return null;
      const u = new URL('/embed/launcher.html', new URL(base));
      u.searchParams.set('project', project);
      const lang = pick(this.getAttribute('lang')) || pick(this.getAttribute('locale'));
      if (lang) u.searchParams.set('lang', lang);
      u.searchParams.set('launcherFrom', 'viewer');
      try {
        const explicit = pick(this.getAttribute('page-url'));
        const raw = explicit || (typeof window !== 'undefined' && window.location ? window.location.href : '');
        if (raw) {
          const p = new URL(raw, window.location.href);
          if (p.protocol === 'https:' || p.protocol === 'http:') {
            p.hash = '';
            const s = p.toString();
            if (s.length <= 2000) u.searchParams.set('page', s);
          }
        }
      } catch {
      }
      return u.toString();
    } catch {
      return null;
    }
  }

  getSnapshot() {
    return this.#request('getSnapshot');
  }

  getShareLink() {
    return this.#request('getShareLink');
  }

  getQr(params) {
    return this.#request('getQr', params || {});
  }
}

if (!customElements.get('togenar-embed')) {
  customElements.define('togenar-embed', TogenarEmbed);
}

export { TogenarEmbed };
