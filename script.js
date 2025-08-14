(function() {
  'use strict';

  const STORAGE_KEYS = {
    election: 'gvs_election_v1',
    audit: 'gvs_audit_v1'
  };

  const elements = {};

  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

  function nowIso() { return new Date().toISOString(); }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function toast(message, durationMs = 3000) {
    const t = $('#toast');
    t.textContent = message;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), durationMs);
  }

  function saveElection(election) {
    localStorage.setItem(STORAGE_KEYS.election, JSON.stringify(election));
  }

  function loadElection() {
    const raw = localStorage.getItem(STORAGE_KEYS.election);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function pushAudit(action, details) {
    const entry = { id: uuid(), time: nowIso(), action, details };
    const raw = localStorage.getItem(STORAGE_KEYS.audit);
    const list = raw ? (JSON.parse(raw)) : [];
    list.push(entry);
    localStorage.setItem(STORAGE_KEYS.audit, JSON.stringify(list));
    return entry;
  }

  function fmtDateForInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function parseInputDate(value) {
    if (!value) return null;
    const time = new Date(value).toISOString();
    return time;
  }

  function withinWindow(election) {
    const n = Date.now();
    const starts = election.startTime ? Date.parse(election.startTime) : null;
    const ends = election.endTime ? Date.parse(election.endTime) : null;
    const started = !starts || n >= starts;
    const ended = !!ends && n >= ends;
    return { started, ended };
  }

  function generateCodes(count, currentCodes) {
    const existing = new Set(currentCodes.map(c => c.code));
    const codes = [];
    function make() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const part = (len) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      return `${part(4)}-${part(3)}`;
    }
    while (codes.length < count) {
      const c = make();
      if (!existing.has(c)) { existing.add(c); codes.push({ code: c, used: false, vote: null }); }
    }
    return codes;
  }

  function download(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function toCsv(rows) {
    return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function ensureElection() {
    let e = loadElection();
    if (!e) {
      e = {
        id: uuid(),
        title: 'Untitled election',
        description: '',
        startTime: null,
        endTime: null,
        allowLiveResults: false,
        settings: { maxChoices: 1 },
        candidates: [],
        voterAccessCodes: [],
        auditLogId: uuid()
      };
      saveElection(e);
      pushAudit('init', { electionId: e.id });
    }
    return e;
  }

  function setActiveTab(targetSelector) {
    $all('.tab').forEach(btn => {
      const active = btn.dataset.target === targetSelector;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    $all('.section').forEach(sec => sec.classList.remove('active'));
    const sec = document.querySelector(targetSelector);
    if (sec) sec.classList.add('active');
  }

  function renderElectionForm(election) {
    $('#election-title').value = election.title || '';
    $('#election-description').value = election.description || '';
    $('#election-start').value = fmtDateForInput(election.startTime);
    $('#election-end').value = fmtDateForInput(election.endTime);
    $('#allow-live-results').checked = !!election.allowLiveResults;
    $('#max-choices').value = election.settings?.maxChoices ?? 1;
  }

  function renderCandidates(election) {
    const list = $('#candidate-list');
    list.innerHTML = '';
    if (!election.candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'muted small';
      empty.textContent = 'No candidates yet.';
      list.appendChild(empty);
      return;
    }
    election.candidates.forEach(c => {
      const div = document.createElement('div');
      div.className = 'candidate-item';
      div.innerHTML = `
        <div class="meta">
          <div class="name"><span class="color-dot" style="background:${c.color}"></span>${c.name}</div>
          <div class="tagline">${c.tagline ? c.tagline : ''}</div>
        </div>
        <div class="actions">
          <button class="btn ghost" data-action="up" data-id="${c.id}">▲</button>
          <button class="btn ghost" data-action="down" data-id="${c.id}">▼</button>
          <button class="btn danger ghost" data-action="remove" data-id="${c.id}">Remove</button>
        </div>`;
      list.appendChild(div);
    });

    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const idx = election.candidates.findIndex(x => x.id === id);
      if (idx === -1) return;
      if (action === 'remove') {
        election.candidates.splice(idx, 1);
        saveElection(election);
        pushAudit('candidate.remove', { id });
        renderCandidates(election);
        renderBallotCandidates(election);
        renderResults();
      } else if (action === 'up' && idx > 0) {
        const tmp = election.candidates[idx - 1];
        election.candidates[idx - 1] = election.candidates[idx];
        election.candidates[idx] = tmp;
        saveElection(election);
        renderCandidates(election);
        renderBallotCandidates(election);
      } else if (action === 'down' && idx < election.candidates.length - 1) {
        const tmp = election.candidates[idx + 1];
        election.candidates[idx + 1] = election.candidates[idx];
        election.candidates[idx] = tmp;
        saveElection(election);
        renderCandidates(election);
        renderBallotCandidates(election);
      }
    }, { once: true });
  }

  function renderCodes(election) {
    const wrap = $('#codes-list');
    wrap.innerHTML = '';
    if (!election.voterAccessCodes.length) {
      const empty = document.createElement('div');
      empty.className = 'muted small';
      empty.textContent = 'No codes generated yet.';
      wrap.appendChild(empty);
      return;
    }
    election.voterAccessCodes.forEach(c => {
      const div = document.createElement('div');
      div.className = 'code';
      const badgeClass = c.used ? 'used' : 'free';
      const badgeText = c.used ? 'used' : 'free';
      div.innerHTML = `<div class="val">${c.code}</div><div class="badge ${badgeClass}">${badgeText}</div>`;
      wrap.appendChild(div);
    });
  }

  function renderBallotCandidates(election) {
    const wrap = $('#ballot-candidates');
    wrap.innerHTML = '';
    const maxChoices = Math.max(1, Number(election.settings?.maxChoices || 1));
    const multi = maxChoices > 1;
    $('#review-vote').disabled = true;

    election.candidates.forEach(c => {
      const label = document.createElement('label');
      label.className = 'card-option';
      label.innerHTML = `
        <input type="${multi ? 'checkbox' : 'radio'}" name="candidate" value="${c.id}" />
        <div class="title"><span class="color-dot" style="background:${c.color}"></span>${c.name}</div>
        <div class="muted small">${c.tagline ?? ''}</div>`;
      const input = label.querySelector('input');

      function update() {
        const inputs = $all('input[name="candidate"]');
        const checked = inputs.filter(i => i.checked);
        label.classList.toggle('selected', input.checked);
        if (multi && checked.length > maxChoices) {
          input.checked = false;
          label.classList.remove('selected');
          toast(`You can select up to ${maxChoices}`);
          return;
        }
        $('#review-vote').disabled = checked.length === 0 || checked.length > maxChoices;
      }

      input.addEventListener('change', update);
      label.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          input.checked = !input.checked;
        }
        update();
      });

      wrap.appendChild(label);
    });
  }

  function computeResults() {
    const election = ensureElection();
    const counts = new Map(election.candidates.map(c => [c.id, 0]));
    election.voterAccessCodes.forEach(vc => {
      if (!vc.vote) return;
      if (Array.isArray(vc.vote)) {
        vc.vote.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
      } else {
        counts.set(vc.vote, (counts.get(vc.vote) || 0) + 1);
      }
    });
    const rows = election.candidates.map(c => ({ id: c.id, name: c.name, color: c.color, count: counts.get(c.id) || 0 }));
    const total = rows.reduce((a, b) => a + b.count, 0);
    return { rows, total, election };
  }

  function renderResults() {
    const { rows, total, election } = computeResults();
    const { started, ended } = withinWindow(election);
    const statusEl = $('#results-status');
    const container = $('#results-container');
    container.innerHTML = '';

    if (!started) {
      statusEl.textContent = 'Election has not started yet.';
      return;
    }

    if (!election.allowLiveResults && !ended) {
      statusEl.textContent = 'Live results are disabled until the election ends.';
      return;
    }

    statusEl.textContent = ended ? 'Final results:' : 'Live results:';

    const max = Math.max(1, ...rows.map(r => r.count));
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `
        <div class="name">${r.name}</div>
        <div class="bar"><div class="fill" style="width:${(r.count / max) * 100}%; background: ${r.color}"></div></div>
        <div class="count">${r.count}</div>
      `;
      container.appendChild(row);
    });

    const totalEl = document.createElement('div');
    totalEl.className = 'muted small';
    totalEl.textContent = `Total votes: ${total}`;
    container.appendChild(totalEl);
  }

  function showSectionForCode(election, code) {
    const entry = election.voterAccessCodes.find(c => c.code.toUpperCase() === code.toUpperCase());
    if (!entry) { toast('Code not found'); return; }

    const { started, ended } = withinWindow(election);
    if (!started) { toast('Election has not started yet'); return; }
    if (ended) { toast('Election has ended'); return; }

    if (entry.used) {
      $('#voted').classList.remove('hidden');
      $('#ballot').classList.add('hidden');
      $('#ballot-review').classList.add('hidden');
      return;
    }

    $('#ballot').classList.remove('hidden');
    $('#ballot-review').classList.add('hidden');
    $('#voted').classList.add('hidden');

    $('#ballot-context').textContent = `${election.title} — choose ${election.settings.maxChoices} candidate` + (election.settings.maxChoices > 1 ? 's' : '');
    renderBallotCandidates(election);
  }

  function loadDemo() {
    const demo = {
      id: uuid(),
      title: 'Student Council Election 2025',
      description: 'Vote for your representative',
      startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      allowLiveResults: true,
      settings: { maxChoices: 1 },
      candidates: [
        { id: uuid(), name: 'Alex Johnson', tagline: 'Transparency & Inclusion', color: '#6ea8fe' },
        { id: uuid(), name: 'Priya Patel', tagline: 'Innovation for All', color: '#ff8eb3' },
        { id: uuid(), name: 'Mateo García', tagline: 'Community First', color: '#9d6cff' }
      ],
      voterAccessCodes: generateCodes(15, [])
    };
    saveElection(demo);
    pushAudit('demo.load', { id: demo.id });
    renderElectionForm(demo);
    renderCandidates(demo);
    renderCodes(demo);
    renderResults();
    toast('Demo data loaded');
  }

  function exportCodesCsv() {
    const e = ensureElection();
    if (!e.voterAccessCodes.length) { toast('No codes to export'); return; }
    const rows = [['code', 'used']].concat(e.voterAccessCodes.map(c => [c.code, c.used]));
    download('voter_codes.csv', toCsv(rows), 'text/csv');
  }

  function printCodes() {
    const e = ensureElection();
    const codes = e.voterAccessCodes.map(c => `<div style="padding:8px 12px;border:1px solid #000;border-radius:8px;margin:6px;display:inline-block;">Code: <b>${c.code}</b> — ${c.used ? 'USED' : 'FREE'}</div>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print Codes</title></head><body><h1>${e.title} — Voter Codes</h1>${codes}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Popup blocked'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  function exportElectionJson() {
    const e = ensureElection();
    download('election.json', JSON.stringify(e, null, 2), 'application/json');
  }

  function importElectionJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.candidates) || !Array.isArray(data.voterAccessCodes)) {
          toast('Invalid election file');
          return;
        }
        saveElection(data);
        pushAudit('import.json', { id: data.id });
        renderElectionForm(data);
        renderCandidates(data);
        renderCodes(data);
        renderResults();
        toast('Election imported');
      } catch (e) {
        toast('Failed to import election');
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm('Reset all data for this prototype?')) return;
    localStorage.removeItem(STORAGE_KEYS.election);
    localStorage.removeItem(STORAGE_KEYS.audit);
    toast('Data reset');
    location.reload();
  }

  function initGordon() {
    const launch = $('#gordon-launch');
    const panel = $('#gordon');
    const close = $('#gordon-close');
    const messages = $('#gordon-messages');
    const form = $('#gordon-form');
    const input = $('#gordon-text');

    function send(role, text) {
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function answer(question) {
      const q = question.toLowerCase();
      const kb = [
        { k: ['create', 'election', 'setup'], a: 'Go to Admin → fill Title, optional Description, dates, and toggles → Save election.' },
        { k: ['add', 'candidate'], a: 'Admin → Candidates: enter Name and optional Tagline → Add candidate. You can reorder or remove later.' },
        { k: ['generate', 'code', 'codes'], a: 'Admin → Voter access codes: enter a quantity → Generate. Export as CSV or print for distribution.' },
        { k: ['vote', 'cast', 'ballot'], a: 'Voter → enter access code → select one candidate → Review → Submit vote. Codes are single-use.' },
        { k: ['result', 'results', 'tally'], a: 'Results tab shows live or final results depending on settings and end time. Click Refresh to update.' },
        { k: ['import', 'export', 'backup', 'restore'], a: 'Admin → Data: Export election JSON to back up; Import JSON to restore/replace the current election.' },
        { k: ['reset', 'clear'], a: 'Admin → Reset all data clears local browser storage used by this prototype.' },
        { k: ['security', 'secure', 'privacy'], a: 'This is a client-only prototype using localStorage. For production: use a secure backend, audited cryptography, and independent verification.' }
      ];
      for (const item of kb) {
        if (item.k.some(word => q.includes(word))) return item.a;
      }
      return 'Ask me about creating an election, adding candidates, generating codes, casting votes, results, or backup/reset.';
    }

    launch.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        messages.innerHTML = '';
        send('gordon', 'Hi, I am Gordon. How can I help you with your election?');
        send('gordon', 'Try: "How do I generate voter codes?"');
        input.focus();
      }
    });

    close.addEventListener('click', () => panel.classList.add('hidden'));

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      send('user', text);
      input.value = '';
      setTimeout(() => send('gordon', answer(text)), 250);
    });
  }

  function bindEvents() {
    $all('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.target)));

    $('#election-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const e = ensureElection();
      e.title = $('#election-title').value.trim() || 'Untitled election';
      e.description = $('#election-description').value.trim();
      e.startTime = parseInputDate($('#election-start').value);
      e.endTime = parseInputDate($('#election-end').value);
      e.allowLiveResults = $('#allow-live-results').checked;
      e.settings.maxChoices = Math.max(1, parseInt($('#max-choices').value || '1', 10));
      saveElection(e);
      pushAudit('election.save', { id: e.id });
      toast('Election saved');
      renderResults();
    });

    $('#load-demo').addEventListener('click', loadDemo);

    $('#candidate-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const e = ensureElection();
      const name = $('#candidate-name').value.trim();
      const tagline = $('#candidate-tagline').value.trim();
      const color = $('#candidate-color').value;
      if (!name) { toast('Candidate name required'); return; }
      e.candidates.push({ id: uuid(), name, tagline, color });
      saveElection(e);
      pushAudit('candidate.add', { name });
      $('#candidate-name').value = '';
      $('#candidate-tagline').value = '';
      renderCandidates(e);
      renderBallotCandidates(e);
      renderResults();
    });

    $('#codes-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const e = ensureElection();
      const count = Math.max(1, parseInt($('#codes-count').value || '1', 10));
      const newCodes = generateCodes(count, e.voterAccessCodes);
      e.voterAccessCodes = e.voterAccessCodes.concat(newCodes);
      saveElection(e);
      pushAudit('codes.generate', { count });
      renderCodes(e);
      toast(`Generated ${newCodes.length} codes`);
    });

    $('#export-codes').addEventListener('click', exportCodesCsv);
    $('#print-codes').addEventListener('click', printCodes);

    $('#clear-unused-codes').addEventListener('click', () => {
      const e = ensureElection();
      const before = e.voterAccessCodes.length;
      e.voterAccessCodes = e.voterAccessCodes.filter(c => c.used);
      saveElection(e);
      renderCodes(e);
      toast(`Removed ${before - e.voterAccessCodes.length} unused codes`);
    });

    $('#export-json').addEventListener('click', exportElectionJson);
    $('#import-json').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) importElectionJson(file);
      ev.target.value = '';
    });
    $('#reset-all').addEventListener('click', resetAll);

    $('#voter-login').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const code = $('#voter-code').value.trim();
      if (!code) { toast('Enter your access code'); return; }
      const e = ensureElection();
      showSectionForCode(e, code);
    });

    $('#review-vote').addEventListener('click', () => {
      const picks = $all('input[name="candidate"]:checked').map(el => el.value);
      if (picks.length === 0) { toast('Select at least one candidate'); return; }
      const e = ensureElection();
      const sum = $('#review-summary');
      sum.innerHTML = '';
      picks.forEach(id => {
        const c = e.candidates.find(x => x.id === id);
        if (!c) return;
        const div = document.createElement('div');
        div.className = 'card-option selected';
        div.innerHTML = `<div class="title"><span class="color-dot" style="background:${c.color}"></span>${c.name}</div><div class="muted small">${c.tagline ?? ''}</div>`;
        sum.appendChild(div);
      });
      $('#ballot').classList.add('hidden');
      $('#ballot-review').classList.remove('hidden');
    });

    $('#edit-vote').addEventListener('click', () => {
      $('#ballot-review').classList.add('hidden');
      $('#ballot').classList.remove('hidden');
    });

    $('#cancel-vote').addEventListener('click', () => {
      $('#ballot').classList.add('hidden');
      $('#ballot-review').classList.add('hidden');
      $('#voted').classList.add('hidden');
      $('#voter-code').value = '';
    });

    $('#submit-vote').addEventListener('click', () => {
      const e = ensureElection();
      const picks = $all('input[name="candidate"]:checked').map(el => el.value);
      if (!picks.length) { toast('Select at least one candidate'); return; }
      const maxChoices = Math.max(1, Number(e.settings?.maxChoices || 1));
      if (picks.length > maxChoices) { toast(`You can select up to ${maxChoices}`); return; }
      const code = $('#voter-code').value.trim();
      const entry = e.voterAccessCodes.find(c => c.code.toUpperCase() === code.toUpperCase());
      if (!entry) { toast('Code not found'); return; }
      if (entry.used) { toast('Code already used'); return; }
      entry.vote = picks;
      entry.used = true;
      saveElection(e);
      pushAudit('vote.cast', { code: entry.code, candidateIds: entry.vote });
      $('#ballot').classList.add('hidden');
      $('#ballot-review').classList.add('hidden');
      $('#voted').classList.remove('hidden');
      renderCodes(e);
      renderResults();
      toast('Your vote has been recorded');
    });

    $('#refresh-results').addEventListener('click', renderResults);
  }

  function init() {
    elements.year = $('#year');
    elements.year.textContent = String(new Date().getFullYear());

    const e = ensureElection();
    renderElectionForm(e);
    renderCandidates(e);
    renderCodes(e);
    renderResults();

    bindEvents();
    initGordon();

    // Default to Admin tab on first load
    setActiveTab('#admin');
  }

  document.addEventListener('DOMContentLoaded', init);
})();