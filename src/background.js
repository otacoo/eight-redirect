/**
 * Background: after a short grace period, send tab to check page if not loaded.
 * Rules are omnidirectional. Grace period (1–10s) is configurable.
 */
const CHECK_PAGE = 'src/check.html';
const REDIRECT_MARKER = '_eight_redirect';
const GRACE_DEFAULT_MS = 3000;
const GRACE_MAX_MS = 10000;

const browser = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

let cachedRules = [];

const gracePending = {};
const lastRequestUrlByTab = {};

function normalizeHost(host) {
  return (host || '').replace(/^www\./, '').toLowerCase();
}

function isSameHost(urlA, urlB) {
  try {
    const uA = new URL(urlA);
    const uB = new URL(urlB);
    if (uA.protocol !== 'http:' && uA.protocol !== 'https:') return false;
    if (uB.protocol !== 'http:' && uB.protocol !== 'https:') return false;
    return normalizeHost(uA.hostname) === normalizeHost(uB.hostname);
  } catch {
    return false;
  }
}

function loadCache() {
  browser.storage.local.get(['rules'], (data) => {
    cachedRules = data.rules || [];
  });
}

function getRedirectForUrlSync(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.has(REDIRECT_MARKER) || u.hash.includes(REDIRECT_MARKER)) return null;
    const host = normalizeHost(u.hostname);
    for (const r of cachedRules) {
      const domains = r.domains && r.domains.length >= 2 ? r.domains.map(normalizeHost) : null;
      if (!domains) continue;
      const idx = domains.findIndex((d) => d === host || u.hostname.toLowerCase() === d);
      if (idx === -1) continue;
      const otherHost = domains[idx === 0 ? 1 : 0];
      if (!otherHost) continue;
      const backupUrl = `${u.protocol}//${otherHost}${u.pathname}${u.search}${u.hash}`;
      return { original: url, backup: backupUrl };
    }
    return null;
  } catch {
    return null;
  }
}

function buildCheckUrl(original, backup, showCheckPage) {
  const check = new URL(CHECK_PAGE, browser.runtime.getURL('/'));
  check.searchParams.set('original', original);
  check.searchParams.set('backup', backup);
  if (showCheckPage === false) check.searchParams.set('silent', '1');
  return check.toString();
}

function clearGrace(tabId) {
  const p = gracePending[tabId];
  if (p) {
    clearTimeout(p.timeoutId);
    delete gracePending[tabId];
  }
}

function redirectAfterGrace(tabId, pair, showCheckPage) {
  clearGrace(tabId);
  browser.tabs.get(tabId, (tab) => {
    if (browser.runtime.lastError || !tab) return;
    const current = (tab.url || '').split('#')[0];
    const originalNorm = (pair.original || '').split('#')[0];
    if (tab.status === 'complete' && current === originalNorm) return;
    if (tab.status === 'complete' && isSameHost(current, pair.original)) return;
    browser.tabs.update(tabId, { url: buildCheckUrl(pair.original, pair.backup, showCheckPage) });
  });
}

function getGraceMsFromStorage(data) {
  const ms = typeof data.graceMs === 'number' ? data.graceMs : 0;
  if (ms >= 1000 && ms <= 10000) return ms;
  return GRACE_DEFAULT_MS;
}

function scheduleGrace(tabId, pair, showCheckPage, graceMs) {
  clearGrace(tabId);
  const timeoutId = setTimeout(() => {
    redirectAfterGrace(tabId, pair, showCheckPage);
  }, graceMs);
  gracePending[tabId] = { pair, timeoutId };
}

function maybeScheduleGrace(tabId, requestUrl, pair, previousRequestUrl) {
  browser.tabs.get(tabId, (tab) => {
    const hasTabUrl = !browser.runtime.lastError && tab && tab.url;
    if (!hasTabUrl) {
      if (previousRequestUrl && isSameHost(previousRequestUrl, requestUrl)) {
        clearGrace(tabId);
        return;
      }
      browser.storage.local.get(['graceMs', 'showCheckPage'], (data) => {
        const showCheckPage = data.showCheckPage !== false;
        scheduleGrace(tabId, pair, showCheckPage, getGraceMsFromStorage(data));
      });
      return;
    }
    if (isSameHost(tab.url, requestUrl)) {
      clearGrace(tabId);
      return;
    }
    browser.storage.local.get(['graceMs', 'showCheckPage'], (data) => {
      const showCheckPage = data.showCheckPage !== false;
      scheduleGrace(tabId, pair, showCheckPage, getGraceMsFromStorage(data));
    });
  });
}

loadCache();
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.rules) loadCache();
});

browser.tabs.onRemoved.addListener((tabId) => {
  clearGrace(tabId);
  delete lastRequestUrlByTab[tabId];
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== 'main_frame' || details.tabId === -1) return;
    const tabId = details.tabId;
    const requestUrl = details.url;
    let pair = getRedirectForUrlSync(requestUrl);
    const previousRequestUrl = lastRequestUrlByTab[tabId];
    if (pair) lastRequestUrlByTab[tabId] = requestUrl;
    if (pair) {
      maybeScheduleGrace(tabId, requestUrl, pair, previousRequestUrl);
      return;
    }
    loadCache();
    browser.storage.local.get(['rules', 'graceMs', 'showCheckPage'], (data) => {
      const rules = data.rules || [];
      const u = new URL(requestUrl);
      if (u.searchParams.has(REDIRECT_MARKER) || u.hash.includes(REDIRECT_MARKER)) return;
      const host = normalizeHost(u.hostname);
      for (const r of rules) {
        const domains = r.domains && r.domains.length >= 2 ? r.domains.map(normalizeHost) : null;
        if (!domains) continue;
        const idx = domains.findIndex((d) => d === host || u.hostname.toLowerCase() === d);
        if (idx === -1) continue;
        const otherHost = domains[idx === 0 ? 1 : 0];
        if (!otherHost) continue;
        const backupUrl = `${u.protocol}//${otherHost}${u.pathname}${u.search}${u.hash}`;
        pair = { original: requestUrl, backup: backupUrl };
        lastRequestUrlByTab[tabId] = requestUrl;
        maybeScheduleGrace(tabId, requestUrl, pair, previousRequestUrl);
        break;
      }
    });
  },
  { urls: ['<all_urls>'] },
  []
);
