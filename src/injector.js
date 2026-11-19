(function () {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/interceptor.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  const LANG_GUARD_KEY = '__bico_lang_guard';
  const LANG_MAX_TRIES = 2;
  const LANG_WINDOW_MS = 60000;

  function getLocaleCookie() {
    const m = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function langGuardAllows() {
    let g;
    try { g = JSON.parse(sessionStorage.getItem(LANG_GUARD_KEY)); } catch (_) { g = null; }
    const now = Date.now();
    if (!g || now - g.t > LANG_WINDOW_MS) g = { n: 0, t: now };
    if (g.n >= LANG_MAX_TRIES) return false;
    g.n += 1;
    sessionStorage.setItem(LANG_GUARD_KEY, JSON.stringify(g));
    return true;
  }

  let enforcing = false;
  let langTimer = null;
  function enforceLanguage() {
    if (!chrome.runtime || !chrome.runtime.id) {
      clearInterval(langTimer);
      return;
    }
    if (enforcing) return;
    chrome.storage.sync.get({ locale: '', enabled: true }, function (s) {
      const desired = (s.locale || '').trim();
      if (!s.enabled || !desired) return;
      const current = getLocaleCookie();
      if (current === null || current.toLowerCase() === desired.toLowerCase()) return;
      if (!langGuardAllows()) return;
      enforcing = true;
      chrome.runtime.sendMessage({ type: 'setLocale', locale: desired }, function (res) {
        if (res && res.ok) location.reload();
        else enforcing = false;
      });
    });
  }

  enforceLanguage();
  langTimer = setInterval(enforceLanguage, 3000);

  window.addEventListener('__bico_cases__', function (e) {
    handleCasesData(e.detail);
  });

  let lastUrl = location.href;
  const observer = new MutationObserver(debounce(checkTabState, 300));
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkOrder();
    }
  }).observe(document, { subtree: true, childList: true });

  let currentOrder = null;
  let renderedOrder = null;
  let autoLoading = false;

  function getOrderId() {
    const m = location.pathname.match(/\/orders\/(\d+)/);
    return m ? m[1] : null;
  }

  function getSelectedTab() {
    return new URLSearchParams(location.search).get('selectedTab');
  }

  function checkOrder() {
    if (!panelEnabled) return;
    const oid = getOrderId();
    if (oid === currentOrder) return;
    currentOrder = oid;
    renderedOrder = null;
    dismissedOrder = null;
    if (document.getElementById('bico-panel')) renderCasesNote('Cases \uBD88\uB7EC\uC624\uB294 \uC911...');
    if (oid) {
      autoLoadCases(oid);
    }
  }

  function waitFor(fn, ms) {
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        const v = fn();
        if (v || Date.now() - start > ms) {
          clearInterval(timer);
          resolve(v || null);
        }
      }, 200);
    });
  }

  function findTab(name) {
    const first = name.toLowerCase().split(' ')[0];
    const exact = name.toLowerCase() === 'cases';
    const panel = document.getElementById('bico-panel');
    return Array.from(document.querySelectorAll('a, button, li, span, div, [role="tab"]')).find(el => {
      if (el.children.length > 0 || el.offsetParent === null) return false;
      if (panel && panel.contains(el)) return false;
      const t = el.textContent.trim().toLowerCase();
      return exact ? t === 'cases' : t.startsWith(first);
    }) || null;
  }

  async function autoLoadCases(oid) {
    if (autoLoading) return;
    autoLoading = true;
    try {
      const sel = getSelectedTab();
      if (sel === 'cases-tab') {
        setTimeout(() => tryDomFallback(0), 1500);
        return;
      }
      const casesTab = await waitFor(() => findTab('cases'), 15000);
      if (!casesTab || getOrderId() !== oid) return;
      const origName = (sel || '').replace(/-tab$/, '').replace(/-/g, ' ');
      const origTab = origName ? findTab(origName) : null;
      casesTab.click();
      await waitFor(() => renderedOrder === oid, 6000);
      if (getSelectedTab() === 'cases-tab' && getOrderId() === oid) {
        if (origTab && origTab.isConnected) origTab.click();
        else history.back();
      }
    } finally {
      autoLoading = false;
      if (getOrderId() === oid && renderedOrder !== oid && getSelectedTab() !== 'cases-tab' && document.getElementById('bico-panel')) {
        renderCasesNote('Cases \uD0ED\uC744 \uC5F4\uBA74 \uC9D1\uACC4\uB429\uB2C8\uB2E4');
      }
    }
  }

  let panelEnabled = false;

  function applyPanelSetting(on) {
    panelEnabled = on;
    if (!on) {
      const panel = document.getElementById('bico-panel');
      if (panel) panel.remove();
      return;
    }
    currentOrder = null;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkOrder, { once: true });
    } else {
      checkOrder();
    }
  }

  chrome.storage.sync.get({ panelEnabled: true }, function (s) {
    applyPanelSetting(s.panelEnabled !== false);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes.panelEnabled) {
      applyPanelSetting(changes.panelEnabled.newValue !== false);
    }
  });

  function checkTabState() {
    const tabButtons = document.querySelectorAll('[class*="tab"], [role="tab"], button');
    tabButtons.forEach(btn => {
      if (btn.textContent.trim().toLowerCase() === 'cases' && !btn.__bicoListened) {
        btn.__bicoListened = true;
        btn.addEventListener('click', function () {
          setTimeout(() => tryDomFallback(0), 1500);
        });
      }
    });
  }

  function handleCasesData(cases) {
    if (!Array.isArray(cases) || cases.length === 0) return;
    renderSummaryPanel(buildStats(cases));
  }

  function tryDomFallback(attempt) {
    if (renderedOrder === getOrderId() && renderedOrder !== null) return;
    const cases = parseDomCases(document.querySelectorAll('table'));
    if (cases.length > 0) {
      renderSummaryPanel(buildStats(cases));
    } else if (attempt < 8) {
      setTimeout(() => tryDomFallback(attempt + 1), 1000);
    }
  }

  function parseDomCases(tables) {
    const cases = [];
    tables.forEach(table => {
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (!headerRow) return;

      const headers = Array.from(headerRow.querySelectorAll('th, td'))
        .map(h => h.textContent.trim().toUpperCase());

      const subtypeIdx = headers.findIndex(h => h === 'SUBTYPE' || h.includes('SUBTYPE'));
      const createdIdx = headers.findIndex(h => h === 'CREATED' || h.includes('CREATED'));
      const typeIdx    = headers.findIndex(h => h === 'TYPE' || h.includes('TYPE'));

      if (subtypeIdx === -1 && typeIdx === -1) return;

      const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      bodyRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const get = i => (i >= 0 && cells[i]) ? cells[i].textContent.trim() : '';

        const rawDate = get(createdIdx);
        // regex: DD/MM/YYYY date detection
        if (!rawDate || !/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(rawDate)) return;
        const date = parseDate(rawDate);
        if (!date) return;

        const subtypeRaw = get(subtypeIdx);
        // regex: leading 4-digit subtype code (e.g. 0906, 1005, 0804)
        const codeMatch = subtypeRaw.match(/^(\d{4})/);
        const category = codeMatch ? codeMatch[1] : (subtypeRaw || get(typeIdx) || 'Unknown');
        const description = codeMatch ? extractDescription(subtypeRaw) : '';

        cases.push({ category, description, date });
      });
    });
    return cases;
  }

  function resolveField(val) {
    if (!val && val !== 0) return null;
    if (typeof val === 'string') return val.trim() || null;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      const name = val.name || val.label || val.description || val.desc || val.text || val.value;
      const code = val.code || val.id || val.key;
      if (name && code) return `${code} - ${name}`;
      if (name) return String(name);
      if (code) return String(code);
    }
    return null;
  }

  function resolveSubtypeCode(val) {
    if (val === null || val === undefined) return null;
    // regex: standalone 4-digit subtype code at start, e.g. "0906 - Home..."
    const CODE_RE = /^\s*(\d{4})(?!\d)/;
    if (typeof val === 'string' || typeof val === 'number') {
      const m = String(val).match(CODE_RE);
      return m ? m[1] : null;
    }
    if (typeof val === 'object') {
      for (const v of Object.values(val)) {
        if (typeof v === 'string' || typeof v === 'number') {
          const m = String(v).match(CODE_RE);
          if (m) return m[1];
        }
      }
    }
    return null;
  }

  function extractDescription(text) {
    // regex: text after the leading 4-digit code and optional dash
    const m = String(text).match(/^\s*\d{4}(?!\d)\s*[-\u2013]?\s*(.+)$/);
    return m ? m[1].trim() : '';
  }

  function resolveSubtypeDesc(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return extractDescription(val);
    if (typeof val !== 'object') return '';
    const values = Object.values(val).filter(v => typeof v === 'string');
    for (const v of values) {
      const d = extractDescription(v);
      if (d) return d;
    }
    const named = val.name || val.label || val.description || val.desc || val.text;
    return typeof named === 'string' && !/^\d{4}$/.test(named.trim()) ? named.trim() : '';
  }

  function isTruncated(s) {
    return /(\.\.\.|\u2026)$/.test(s);
  }

  function resolveCategory(c) {
    if (typeof c.category === 'string' && c.category) return c.category;
    const subRaw = c.subtype || c.subType || c.sub_type || c.caseSubtype;
    return resolveSubtypeCode(subRaw) || 'Unknown';
  }

  function buildStats(cases) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const counts = {};
    const descs = {};
    let total = 0;

    cases.forEach(c => {
      const rawDate = c.date || c.createdAt || c.created_at || c.openDate ||
        c.created || c.creationDate || c.creation_date || '';
      const d = c.date instanceof Date ? c.date : parseDate(rawDate);
      if (!d || d < oneYearAgo) return;

      const cat = resolveCategory(c);
      const desc = typeof c.description === 'string' && c.description
        ? c.description
        : resolveSubtypeDesc(c.subtype || c.subType || c.sub_type || c.caseSubtype);
      if (desc && (!descs[cat] || (isTruncated(descs[cat]) && !isTruncated(desc)))) {
        descs[cat] = desc;
      }
      counts[cat] = (counts[cat] || 0) + 1;
      total++;
    });

    return { counts, descs, total, cutoff: oneYearAgo };
  }

  const panelState = { left: null, top: 80, min: { cases: false } };
  let dismissedOrder = null;

  function enableDrag(panel, handle) {
    handle.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      e.preventDefault();

      function onMove(ev) {
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - handle.offsetHeight;
        panelState.left = Math.min(Math.max(0, ev.clientX - offX), Math.max(0, maxLeft));
        panelState.top = Math.min(Math.max(0, ev.clientY - offY), Math.max(0, maxTop));
        panel.style.left = panelState.left + 'px';
        panel.style.top = panelState.top + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function ensurePanel() {
    if (!panelEnabled) return null;
    if (dismissedOrder !== null && dismissedOrder === getOrderId()) return null;
    let panel = document.getElementById('bico-panel');
    if (panel) return panel;
    ensureStyles();
    panel = document.createElement('div');
    panel.id = 'bico-panel';
    panel.innerHTML = `
      <div class="bico-panel-header">
        <span class="bico-panel-title">BICO \uB3C4\uC6B0\uBBF8</span>
        <button class="bico-panel-close" title="\uB2EB\uAE30">\u2715</button>
      </div>
      <div class="bico-sections"></div>
    `;
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.zIndex = '999999';
    panel.style.width = '420px';
    panel.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
    panel.style.top = panelState.top + 'px';
    if (panelState.left === null) {
      panelState.left = Math.max(0, window.innerWidth - 420 - 20);
    }
    panel.style.left = panelState.left + 'px';

    const header = panel.querySelector('.bico-panel-header');
    header.style.cursor = 'move';
    enableDrag(panel, header);
    panel.querySelector('.bico-panel-close').addEventListener('click', function () {
      dismissedOrder = getOrderId();
      panel.remove();
    });
    return panel;
  }

  function setSection(name, title, extra, bodyHtml) {
    const panel = ensurePanel();
    if (!panel) return;
    const container = panel.querySelector('.bico-sections');
    let sec = container.querySelector('[data-section="' + name + '"]');
    if (!sec) {
      sec = document.createElement('div');
      sec.className = 'bico-section';
      sec.dataset.section = name;
      sec.innerHTML = `
        <div class="bico-sec-header">
          <span class="bico-sec-title"></span>
          <span class="bico-sec-extra"></span>
          <button class="bico-sec-min"></button>
        </div>
        <div class="bico-sec-body"></div>
      `;
      const body = sec.querySelector('.bico-sec-body');
      const btn = sec.querySelector('.bico-sec-min');
      const apply = function () {
        const min = panelState.min[name];
        body.style.display = min ? 'none' : '';
        btn.textContent = min ? '\u25A2' : '\u2014';
        btn.title = min ? '\uD3BC\uCE58\uAE30' : '\uCD5C\uC18C\uD654';
      };
      btn.addEventListener('click', function () {
        panelState.min[name] = !panelState.min[name];
        apply();
      });
      apply();
      container.appendChild(sec);
    }
    sec.querySelector('.bico-sec-title').textContent = title;
    sec.querySelector('.bico-sec-extra').textContent = extra;
    sec.querySelector('.bico-sec-body').innerHTML = bodyHtml;
  }

  const CASES_TITLE = '\uD83D\uDCCA Cases (\uCD5C\uADFC 1\uB144)';

  function renderCasesNote(message) {
    setSection('cases', CASES_TITLE, '', '<div class="bico-note">' + escHtml(message) + '</div>');
  }

  function renderSummaryPanel(stats) {
    if (!panelEnabled) return;
    renderedOrder = getOrderId();

    if (stats.total === 0) {
      setSection('cases', CASES_TITLE, '\uCD1D 0\uAC74',
        '<div class="bico-note">\uCD5C\uADFC 1\uB144 \uB0B4 Cases\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</div>');
      return;
    }

    const sorted = Object.entries(stats.counts).sort((a, b) => b[1] - a[1]);
    const bodyHtml = `
      <table class="bico-stats-table">
        <thead>
          <tr><th>\uCE74\uD14C\uACE0\uB9AC</th><th>\uAC74\uC218</th></tr>
        </thead>
        <tbody>
          ${sorted.map(([cat, count]) => `
            <tr>
              <td class="bico-cat-name" title="${escHtml(cat)}${stats.descs[cat] ? ' - ' + escHtml(stats.descs[cat]) : ''}">
                <div class="bico-cat-code">${escHtml(cat)}</div>
                ${stats.descs[cat] ? `<div class="bico-cat-desc">${escHtml(stats.descs[cat])}</div>` : ''}
              </td>
              <td class="bico-cat-count">${count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="bico-panel-footer">
        \uC774 \uC8FC\uBB38\uC758 Cases\uB97C SUBTYPE \uCF54\uB4DC\uBCC4\uB85C \uC9D1\uACC4 \u00B7 \uC9D1\uACC4 \uAE30\uAC04: ${formatDate(stats.cutoff)} ~ \uC624\uB298
      </div>
    `;
    setSection('cases', CASES_TITLE, '\uCD1D ' + stats.total + '\uAC74', bodyHtml);
  }

  function findCasesTabContent() {
    const selectors = [
      '[aria-selected="true"] ~ * [class*="content"]',
      '[class*="tab-content"][class*="active"]',
      '[class*="tabPanel"][aria-hidden="false"]',
      '[role="tabpanel"]:not([hidden])',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return str;
    const s = String(str).trim();
    // ISO 8601: 2026-01-15T... or 2026-01-15 12:00:00
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
    // European with time: DD/MM/YYYY, HH:MM:SS  (BICO UI format)
    const mLong = s.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}:\d{2}(?::\d{2})?)/);
    if (mLong) return new Date(`${mLong[3]}-${mLong[2]}-${mLong[1]}T${mLong[4]}`);
    // European date only: DD/MM/YYYY
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
    // Unix timestamp (10 or 13 digits)
    if (/^\d{10,13}$/.test(s)) return new Date(Number(s) * (s.length === 10 ? 1000 : 1));
    return null;
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function ensureStyles() {
    if (document.getElementById('bico-styles')) return;
    const style = document.createElement('style');
    style.id = 'bico-styles';
    style.textContent = getStyles();
    document.head.appendChild(style);
  }

  function getStyles() {
    return `
      #bico-panel {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        margin-bottom: 16px;
        overflow: hidden;
      }
      .bico-panel-header {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        background: #1a1a1a;
        color: #fff;
        gap: 8px;
      }
      .bico-panel-title {
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.3px;
        flex: 1;
      }
      .bico-panel-header { user-select: none; }
      .bico-panel-close {
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        line-height: 1;
      }
      .bico-panel-close:hover { color: #fff; }
      .bico-stats-table {
        width: 100%;
        border-collapse: collapse;
      }
      .bico-stats-table thead th {
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding-bottom: 6px;
        border-bottom: 1px solid #f0f0f0;
      }
      .bico-stats-table thead th:nth-child(2) {
        text-align: right;
      }
      .bico-stats-table tbody tr {
        border-bottom: 1px solid #f8f8f8;
      }
      .bico-stats-table tbody tr:last-child { border-bottom: none; }
      .bico-stats-table td {
        padding: 6px 0;
        vertical-align: middle;
      }
      .bico-cat-name {
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #222;
        padding-right: 8px;
      }
      .bico-section { border-top: 1px solid #e0e0e0; }
      .bico-sec-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: #f5f5f5;
        color: #1a1a1a;
      }
      .bico-sec-title { font-weight: 600; font-size: 12px; flex: 1; }
      .bico-sec-extra { font-size: 11px; color: #777; }
      .bico-sec-min {
        background: none;
        border: none;
        color: #777;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        line-height: 1;
      }
      .bico-sec-min:hover { color: #000; }
      .bico-sec-body { padding: 12px 14px 8px; }
      .bico-note { color: #888; font-size: 12px; padding-bottom: 4px; }
      .bico-cat-code { font-weight: 600; }
      .bico-cat-desc {
        font-size: 11px;
        color: #888;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bico-cat-count {
        text-align: right;
        font-weight: 700;
        color: #111;
        white-space: nowrap;
        min-width: 32px;
      }
      .bico-panel-footer {
        margin-top: 8px;
        font-size: 11px;
        color: #bbb;
        padding-top: 6px;
        border-top: 1px solid #f0f0f0;
      }
    `;
  }
})();
