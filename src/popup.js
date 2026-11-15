const enabledEl = document.getElementById('enabled');
const localeEl = document.getElementById('locale');
const statusEl = document.getElementById('status');

chrome.storage.sync.get({ locale: '', enabled: true }, s => {
  enabledEl.checked = s.enabled;
  localeEl.value = s.locale;
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set(
    { locale: localeEl.value.trim(), enabled: enabledEl.checked },
    () => {
      statusEl.textContent = '저장됨';
      setTimeout(() => { statusEl.textContent = ''; }, 1500);
    }
  );
});
