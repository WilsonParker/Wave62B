const enabledEl = document.getElementById('enabled');
const localeEl = document.getElementById('locale');
const panelEnabledEl = document.getElementById('panelEnabled');
const statusEl = document.getElementById('status');

chrome.storage.sync.get({ locale: '', enabled: true, panelEnabled: true }, s => {
  enabledEl.checked = s.enabled;
  panelEnabledEl.checked = s.panelEnabled;
  localeEl.value = s.locale;
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set(
    { locale: localeEl.value.trim(), enabled: enabledEl.checked, panelEnabled: panelEnabledEl.checked },
    () => {
      statusEl.textContent = '저장됨';
      setTimeout(() => { statusEl.textContent = ''; }, 1500);
    }
  );
});
