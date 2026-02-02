/**
 * Options: domain pairs, show-check-page, localStorage backup on redirect and restore.
 */
(function () {
  const browser = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;
  const storage = browser.storage.local;

  const PREFIX_BACKUP = 'ls_backup_';
  const PREFIX_RESTORE = 'ls_restore_';

  const GRACE_MIN = 1;
  const GRACE_MAX = 10;
  const GRACE_DEFAULT = 3;

  const showCheckPageEl = document.getElementById('show-check-page');
  const graceSecondsEl = document.getElementById('grace-seconds');
  const rulesEl = document.getElementById('rules');
  const addBtn = document.getElementById('add');
  const saveBtn = document.getElementById('save');

  function normalizeHost(host) {
    return (host || '').replace(/^www\./, '').toLowerCase().trim();
  }

  function pairId(domains) {
    const a = normalizeHost(domains[0]);
    const b = normalizeHost(domains[1]);
    if (!a || !b) return '';
    return [a, b].sort().join('_');
  }

  function ruleToDomains(rule) {
    if (rule.domains && rule.domains.length >= 2) return [rule.domains[0] || '', rule.domains[1] || ''];
    if (rule.from != null || rule.to != null) return [rule.from || '', rule.to || ''];
    return ['', ''];
  }

  function renderRule(rule) {
    const [a, b] = ruleToDomains(rule);
    const backup = rule.backupLocalStorage === true;
    const pid = pairId([a, b]);
    const div = document.createElement('div');
    div.className = 'rule';
    div.dataset.pairId = pid;

    const row = document.createElement('div');
    row.className = 'rule-row';
    const inputA = document.createElement('input');
    inputA.type = 'text';
    inputA.className = 'domain-a';
    inputA.placeholder = 'e.g. example.org';
    inputA.value = a;
    const span = document.createElement('span');
    span.textContent = '↔';
    const inputB = document.createElement('input');
    inputB.type = 'text';
    inputB.className = 'domain-b';
    inputB.placeholder = 'e.g. example.com';
    inputB.value = b;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'del';
    delBtn.textContent = 'Remove';
    row.append(inputA, span, inputB, delBtn);

    const opts = document.createElement('div');
    opts.className = 'rule-opts';
    const labelBackup = document.createElement('label');
    const backupCb = document.createElement('input');
    backupCb.type = 'checkbox';
    backupCb.className = 'backup-ls';
    backupCb.checked = backup;
    labelBackup.append(backupCb, document.createTextNode(' Backup localStorage on redirect'));
    const restoreRow = document.createElement('div');
    restoreRow.className = 'restore-row';
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'restore';
    restoreBtn.setAttribute('data-pair-id', pid);
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Restore from backup';
    const backupDate = document.createElement('span');
    backupDate.className = 'backup-date';
    restoreRow.append(restoreBtn, backupDate);
    opts.append(labelBackup, restoreRow);

    div.append(row, opts);
    return div;
  }

  function collectRules() {
    const rules = [];
    rulesEl.querySelectorAll('.rule').forEach((row) => {
      const a = (row.querySelector('.domain-a') || {}).value || '';
      const b = (row.querySelector('.domain-b') || {}).value || '';
      const da = a.trim();
      const db = b.trim();
      if (!da && !db) return;
      const backup = (row.querySelector('.backup-ls') || {}).checked === true;
      rules.push({ domains: [da, db], backupLocalStorage: backup });
    });
    return rules;
  }

  function clampGrace(sec) {
    const n = parseInt(sec, 10);
    if (Number.isNaN(n) || n < GRACE_MIN) return GRACE_DEFAULT;
    if (n > GRACE_MAX) return GRACE_MAX;
    return n;
  }

  function applyData(data) {
    if (showCheckPageEl) showCheckPageEl.checked = data.showCheckPage !== false;
    if (graceSecondsEl) graceSecondsEl.value = clampGrace(data.graceSeconds);
    let rules = data.rules || [];
    rules = rules.map((r) => ({
      domains: r.domains ? r.domains : [r.from || '', r.to || ''],
      backupLocalStorage: r.backupLocalStorage === true,
    }));
    rulesEl.innerHTML = '';
    rules.forEach((rule, i) => rulesEl.appendChild(renderRule(rule, i)));
    if (rules.length === 0) addRule();
    else bindRuleEvents();
    updateRestoreButtons();
  }

  function formatBackupDate(updatedAt) {
    if (updatedAt == null || typeof updatedAt !== 'number') return '';
    try {
      const d = new Date(updatedAt);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  function updateRestoreButtons() {
    storage.get(null, (all) => {
      rulesEl.querySelectorAll('.rule').forEach((row) => {
        const pid = row.dataset.pairId;
        const btn = row.querySelector('.restore');
        const dateEl = row.querySelector('.backup-date');
        if (!btn || !pid) return;
        const key = PREFIX_BACKUP + pid;
        const entry = all[key];
        const hasBackup = entry && entry.data;
        btn.disabled = !hasBackup;
        if (dateEl) {
          if (hasBackup && entry.updatedAt != null) {
            dateEl.textContent = '(last saved ' + formatBackupDate(entry.updatedAt) + ')';
          } else {
            dateEl.textContent = '';
          }
        }
      });
    });
  }

  function bindRuleEvents() {
    rulesEl.querySelectorAll('.del').forEach((btn) => {
      btn.onclick = () => btn.closest('.rule').remove();
    });
    rulesEl.querySelectorAll('.restore').forEach((btn) => {
      btn.onclick = () => {
        const pid = btn.getAttribute('data-pair-id');
        if (!pid) return;
        const key = PREFIX_RESTORE + pid;
        storage.set({ [key]: true }, () => {
          const t = btn.textContent;
          btn.textContent = 'Restore requested';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = t;
            updateRestoreButtons();
          }, 2500);
        });
      };
    });
  }

  function load() {
    storage.get(['showCheckPage', 'graceSeconds', 'rules'], (data) => {
      const hasLocal = data.showCheckPage != null || data.graceSeconds != null || (data.rules && data.rules.length > 0);
      if (hasLocal) {
        applyData(data);
        return;
      }
      browser.storage.sync.get(['showCheckPage', 'graceSeconds', 'rules'], (syncData) => {
        const hasSync = syncData.showCheckPage != null || syncData.graceSeconds != null || (syncData.rules && syncData.rules.length > 0);
        if (hasSync) {
          const rules = (syncData.rules || []).map((r) => ({
            domains: r.domains || [r.from || '', r.to || ''],
            backupLocalStorage: r.backupLocalStorage === true,
          }));
          const showCheckPage = syncData.showCheckPage !== false;
          const graceSeconds = clampGrace(syncData.graceSeconds);
          storage.set({ showCheckPage, graceSeconds, rules });
          applyData({ showCheckPage, graceSeconds, rules });
        } else {
          applyData({});
        }
      });
    });
  }

  function addRule() {
    const rules = collectRules();
    rules.push({ domains: ['', ''], backupLocalStorage: false });
    rulesEl.innerHTML = '';
    rules.forEach((rule, i) => rulesEl.appendChild(renderRule(rule, i)));
    bindRuleEvents();
    updateRestoreButtons();
  }

  addBtn.addEventListener('click', addRule);
  saveBtn.addEventListener('click', () => {
    const showCheckPage = showCheckPageEl ? showCheckPageEl.checked : true;
    const graceSeconds = graceSecondsEl ? clampGrace(graceSecondsEl.value) : GRACE_DEFAULT;
    const graceMs = graceSeconds * 1000;
    const rules = collectRules();
    storage.set({ showCheckPage, graceSeconds, graceMs, rules }, () => {
      saveBtn.textContent = 'Saved';
      setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
      updateRestoreButtons();
    });
  });

  load();
})();
