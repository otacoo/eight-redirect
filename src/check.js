/**
 * Check page: redirect to backup.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const original = params.get('original');
  const backup = params.get('backup');

  if (!original || !backup) {
    document.body.innerHTML = '<p>Missing redirect parameters.</p>';
    return;
  }

  const silent = params.get('silent') === '1';
  if (silent) document.body.innerHTML = '';

  // Marker to avoid redirect loops
  const MARKER = '_eight_redirect';
  function addMarker(url) {
    try {
      const u = new URL(url);
      u.searchParams.set(MARKER, '1');
      return u.toString();
    } catch {
      return url + (url.includes('?') ? '&' : '?') + MARKER + '=1';
    }
  }

  // Show "Checking availability..." message for 400ms
  const SHOW_MSG_AFTER_MS = 400;
  const msgEl = silent ? null : document.getElementById('check-msg');
  if (msgEl) {
    setTimeout(() => { msgEl.style.visibility = 'visible'; }, SHOW_MSG_AFTER_MS);
  }

  window.location.replace(addMarker(backup));
})();
