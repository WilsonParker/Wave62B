(function () {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/interceptor.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

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
      onNavigate();
    }
  }).observe(document, { subtree: true, childList: true });

  function onNavigate() {
    if (location.href.includes('cases')) {
      setTimeout(tryDomFallback, 1000);
    }
    const panel = document.getElementById('bico-case-summary');
    if (panel) panel.remove();
  }

  function checkTabState() {
    const tabButtons = document.querySelectorAll('[class*="tab"], [role="tab"], button');
    tabButtons.forEach(btn => {
      if (btn.textContent.trim().toLowerCase() === 'cases' && !btn.__bicoListened) {
        btn.__bicoListened = true;
        btn.addEventListener('click', function () {
          setTimeout(tryDomFallback, 1500);
        });
      }
    });
  }

  function handleCasesData(cases) {
    if (!Array.isArray(cases) || cases.length === 0) return;
    renderSummaryPanel(buildStats(cases));
  }

  function tryDomFallback() {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) {
      setTimeout(tryDomFallback, 1000);
      return;
    }
    const cases = parseDomCases(tables);
    if (cases.length > 0) {
      renderSummaryPanel(buildStats(cases));
    } else {
      setTimeout(tryDomFallback, 1000);
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

        cases.push({ category, date });
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

  function resolveCategory(c) {
    if (typeof c.category === 'string' && c.category) return c.category;
    const subRaw = c.subtype || c.subType || c.sub_type || c.caseSubtype;
    return resolveSubtypeCode(subRaw) || 'Unknown';
  }

  function buildStats(cases) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const counts = {};
    let total = 0;

    cases.forEach(c => {
      const rawDate = c.date || c.createdAt || c.created_at || c.openDate ||
        c.created || c.creationDate || c.creation_date || '';
      const d = c.date instanceof Date ? c.date : parseDate(rawDate);
      if (!d || d < oneYearAgo) return;

      const cat = resolveCategory(c);
      counts[cat] = (counts[cat] || 0) + 1;
      total++;
    });

    return { counts, total, cutoff: oneYearAgo };
  }

  const panelState = { left: null, top: 80, minimized: false };

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

  function renderSummaryPanel(stats) {
    const existing = document.getElementById('bico-case-summary');
    if (existing) existing.remove();

    if (stats.total === 0) return;

    const sorted = Object.entries(stats.counts).sort((a, b) => b[1] - a[1]);

    const panel = document.createElement('div');
    panel.id = 'bico-case-summary';
    panel.innerHTML = `
      <div class="bico-panel-header">
        <span class="bico-panel-title">📊 Cases (최근 1년)</span>
        <span class="bico-panel-total">총 ${stats.total}건</span>
        <button class="bico-panel-min" title="최소화">${panelState.minimized ? '▢' : '—'}</button>
        <button class="bico-panel-close" title="닫기">✕</button>
      </div>
      <div class="bico-panel-body">
        <table class="bico-stats-table">
          <thead>
            <tr><th>카테고리</th><th>건수</th><th>비율</th></tr>
          </thead>
          <tbody>
            ${sorted.map(([cat, count]) => `
              <tr>
                <td class="bico-cat-name" title="${escHtml(cat)}">${escHtml(cat)}</td>
                <td class="bico-cat-count">${count}</td>
                <td class="bico-cat-bar">
                  <div class="bico-bar-wrap">
                    <div class="bico-bar-fill" style="width:${Math.round(count / stats.total * 100)}%"></div>
                    <span class="bico-bar-pct">${Math.round(count / stats.total * 100)}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="bico-panel-footer">
          집계 기간: ${formatDate(stats.cutoff)} ~ 오늘
        </div>
      </div>
    `;

    if (!document.getElementById('bico-styles')) {
      const style = document.createElement('style');
      style.id = 'bico-styles';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }

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

    const body = panel.querySelector('.bico-panel-body');
    const minBtn = panel.querySelector('.bico-panel-min');
    body.style.display = panelState.minimized ? 'none' : '';
    minBtn.addEventListener('click', function () {
      panelState.minimized = !panelState.minimized;
      body.style.display = panelState.minimized ? 'none' : '';
      minBtn.textContent = panelState.minimized ? '▢' : '—';
      minBtn.title = panelState.minimized ? '펼치기' : '최소화';
    });

    const header = panel.querySelector('.bico-panel-header');
    header.style.cursor = 'move';
    enableDrag(panel, header);

    panel.querySelector('.bico-panel-close').addEventListener('click', () => panel.remove());
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

  function getStyles() {
    return `
      #bico-case-summary {
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
      .bico-panel-total {
        font-size: 12px;
        color: #aaa;
        margin-right: 4px;
      }
      .bico-panel-min {
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        line-height: 1;
      }
      .bico-panel-min:hover { color: #fff; }
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
      .bico-panel-body {
        padding: 12px 14px 8px;
      }
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
      .bico-stats-table thead th:nth-child(2),
      .bico-stats-table thead th:nth-child(3) {
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
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #222;
        padding-right: 8px;
      }
      .bico-cat-count {
        text-align: right;
        font-weight: 700;
        color: #111;
        padding-right: 12px;
        white-space: nowrap;
        min-width: 32px;
      }
      .bico-cat-bar { width: 140px; }
      .bico-bar-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .bico-bar-fill {
        height: 6px;
        background: #1a1a1a;
        border-radius: 3px;
        min-width: 2px;
        flex-shrink: 0;
        transition: width 0.3s ease;
      }
      .bico-bar-pct {
        font-size: 11px;
        color: #999;
        white-space: nowrap;
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
