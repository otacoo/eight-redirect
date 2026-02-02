/**
 * Strip _eight_redirect from URL; backup localStorage on redirect; restore on request.
 */
(function () {
  const browser = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;
  const PREFIX_BACKUP = 'ls_backup_';
  const PREFIX_RESTORE = 'ls_restore_';

  function normalizeHost(host) {
    return (host || '').replace(/^www\./, '').toLowerCase().trim();
  }

  function pairId(domains) {
    const a = normalizeHost(domains[0]);
    const b = normalizeHost(domains[1]);
    if (!a || !b) return '';
    return [a, b].sort().join('_');
  }

  function getPageStorage() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k != null) out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  }

  function setPageStorage(data) {
    try {
      if (!data || typeof data !== 'object') return;
      localStorage.clear();
      Object.keys(data).forEach((k) => {
        if (typeof data[k] === 'string') localStorage.setItem(k, data[k]);
      });
    } catch (e) {}
  }

  function keyCount(obj) {
    return obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
  }

  function isBetter(current, backup) {
    const c = keyCount(current);
    const b = keyCount(backup && backup.data ? backup.data : null);
    if (c === 0) return false;
    if (b === 0) return true;
    return c >= b;
  }

  let hadRedirect = false;
  (function stripRedirectMarker() {
    const params = new URLSearchParams(location.search);
    hadRedirect = params.has('_eight_redirect');
    if (!hadRedirect) return;
    params.delete('_eight_redirect');
    const search = params.toString();
    let clean = location.pathname;
    if (search) clean += '?' + search;
    clean += location.hash;
    history.replaceState(history.state, '', clean);
  })();

  function runLocalStorageLogic() {
    const host = normalizeHost(location.hostname);
    if (!host) return;

    browser.storage.local.get(['rules'], (data) => {
      const rules = data.rules || [];
      let match = null;
      for (const r of rules) {
        const domains = r.domains && r.domains.length >= 2 ? r.domains.map(normalizeHost) : null;
        if (!domains) continue;
        const idx = domains.findIndex((d) => d === host);
        if (idx === -1) continue;
        match = r;
        break;
      }
      if (!match) return;

      const pid = pairId(match.domains);
      if (!pid) return;

      const backupKey = PREFIX_BACKUP + pid;
      const restoreKey = PREFIX_RESTORE + pid;

      browser.storage.local.get([restoreKey, backupKey], (stored) => {
        const restoreRequested = stored[restoreKey] === true;
        const backupEntry = stored[backupKey];

        if (restoreRequested && backupEntry && backupEntry.data) {
          setPageStorage(backupEntry.data);
          browser.storage.local.remove(restoreKey);
          return;
        }

        if (hadRedirect && match.backupLocalStorage) {
          const current = getPageStorage();
          if (!backupEntry || isBetter(current, backupEntry)) {
            browser.storage.local.set({ [backupKey]: { data: current, updatedAt: Date.now() } });
          }
        }
      });
    });
  }

  function getPairForCurrentHost(cb) {
    const host = normalizeHost(location.hostname);
    if (!host) {
      cb(null);
      return;
    }
    browser.storage.local.get(['rules'], (data) => {
      const rules = data.rules || [];
      let match = null;
      for (const r of rules) {
        const domains = r.domains && r.domains.length >= 2 ? r.domains.map(normalizeHost) : null;
        if (!domains) continue;
        const idx = domains.findIndex((d) => d === host);
        if (idx === -1) continue;
        match = r;
        break;
      }
      if (!match) {
        cb(null);
        return;
      }
      const pid = pairId(match.domains);
      cb(pid ? { match, pairId: pid } : null);
    });
  }

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'backup') {
      getPairForCurrentHost((pair) => {
        if (!pair) {
          sendResponse({ ok: false, reason: 'Not a paired domain' });
          return;
        }
        const backupKey = PREFIX_BACKUP + pair.pairId;
        const current = getPageStorage();
        browser.storage.local.set(
          { [backupKey]: { data: current, updatedAt: Date.now() } },
          () => sendResponse({ ok: true })
        );
      });
      return true;
    }
    if (msg.action === 'restore') {
      getPairForCurrentHost((pair) => {
        if (!pair) {
          sendResponse({ ok: false, reason: 'Not a paired domain' });
          return;
        }
        const backupKey = PREFIX_BACKUP + pair.pairId;
        browser.storage.local.get([backupKey], (stored) => {
          const entry = stored[backupKey];
          if (!entry || !entry.data) {
            sendResponse({ ok: false, reason: 'No backup' });
            return;
          }
          setPageStorage(entry.data);
          sendResponse({ ok: true });
        });
      });
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLocalStorageLogic);
  } else {
    runLocalStorageLogic();
  }
})();
