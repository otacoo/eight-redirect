const browser = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

function normalizeHost(host) {
  return (host || '').replace(/^www\./, '').toLowerCase().trim();
}

function isHostInRules(host, rules) {
  if (!host || !Array.isArray(rules)) return false;
  for (const r of rules) {
    const domains = r.domains && r.domains.length >= 2 ? r.domains.map(normalizeHost) : null;
    if (!domains) continue;
    if (domains.some((d) => d === host)) return true;
  }
  return false;
}

function updateLsVisibility() {
  const lsEl = document.getElementById('ls-actions');
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    let host = '';
    try {
      if (tab && tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:'))) {
        host = normalizeHost(new URL(tab.url).hostname);
      }
    } catch (_) {}
    browser.storage.local.get(['rules'], (data) => {
      const rules = data.rules || [];
      lsEl.style.display = isHostInRules(host, rules) ? '' : 'none';
    });
  });
}

updateLsVisibility();

document.getElementById('options').addEventListener('click', (e) => {
  e.preventDefault();
  if (browser.runtime.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    window.open(browser.runtime.getURL('src/options.html'));
  }
});

function showFeedback(el, text) {
  const orig = el.textContent;
  el.textContent = text;
  setTimeout(() => { el.textContent = orig; }, 2000);
}

function sendToTab(action) {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      return;
    }
    browser.tabs.sendMessage(tab.id, { action }, (response) => {
      const backupEl = document.getElementById('backup-ls');
      const restoreEl = document.getElementById('restore-ls');
      if (browser.runtime.lastError) {
        showFeedback(action === 'backup' ? backupEl : restoreEl, "Can't run on this page");
        return;
      }
      if (response && response.ok) {
        showFeedback(action === 'backup' ? backupEl : restoreEl, action === 'backup' ? 'Backed up' : 'Restored');
      } else {
        showFeedback(action === 'backup' ? backupEl : restoreEl, response?.reason || 'Not available');
      }
    });
  });
}

document.getElementById('backup-ls').addEventListener('click', (e) => {
  e.preventDefault();
  sendToTab('backup');
});

document.getElementById('restore-ls').addEventListener('click', (e) => {
  e.preventDefault();
  sendToTab('restore');
});
