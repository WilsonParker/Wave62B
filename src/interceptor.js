(function () {
  if (window.__bicoInterceptorInstalled) return;
  window.__bicoInterceptorInstalled = true;

  const CASES_PATH_RE = /cases/i;

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';

    if (CASES_PATH_RE.test(url)) {
      response.clone().json().then(data => {
        const cases = extractCasesArray(data);
        if (cases && cases.length > 0) {
          window.dispatchEvent(new CustomEvent('__bico_cases__', { detail: cases }));
        }
      }).catch(() => {});
    }

    return response;
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__bicoUrl = url;
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__bicoUrl && CASES_PATH_RE.test(this.__bicoUrl)) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          const cases = extractCasesArray(data);
          if (cases && cases.length > 0) {
            window.dispatchEvent(new CustomEvent('__bico_cases__', { detail: cases }));
          }
        } catch (_) {}
      });
    }
    return originalXhrSend.apply(this, args);
  };

  function extractCasesArray(data) {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    const keys = ['cases', 'data', 'items', 'results', 'content', 'records'];
    for (const k of keys) {
      if (Array.isArray(data[k])) return data[k];
    }
    if (data.data && typeof data.data === 'object') {
      for (const k of keys) {
        if (Array.isArray(data.data[k])) return data.data[k];
      }
    }
    return null;
  }
})();
