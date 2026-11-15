const BICO_URL = 'https://apps.inditex.com/';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'setLocale') {
    setLocaleCookie(msg.locale).then(
      () => sendResponse({ ok: true }),
      err => sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }
  return false;
});

async function setLocaleCookie(locale) {
  const existing = await chrome.cookies.getAll({ url: BICO_URL, name: 'locale' });
  if (existing.length === 0) {
    await chrome.cookies.set({ url: BICO_URL, name: 'locale', value: locale, path: '/' });
    return;
  }
  for (const c of existing) {
    const host = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    const details = {
      url: `https://${host}${c.path}`,
      name: c.name,
      value: locale,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    await chrome.cookies.set(details);
  }
}
