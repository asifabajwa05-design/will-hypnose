'use strict';
const $app = document.getElementById('app');
const S = { user: null, tab: 'heute', date: today(), activities: [], day: null, family: null, history: null, users: null, counter: null };

function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function shift(date, n) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function niceDate(date) {
  if (date === today()) return 'Heute';
  if (date === shift(today(), -1)) return 'Gestern';
  return new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
const COLORS = ['#0f766e', '#7c3aed', '#c2410c', '#be185d', '#1d4ed8', '#4d7c0f', '#b45309', '#0e7490'];
const color = (id) => COLORS[parseInt(id.slice(0, 4), 16) % COLORS.length];
const avatar = (m) => `<span class="avatar" style="background:${color(m.id)}">${esc((m.name || '?')[0].toUpperCase())}</span>`;

function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.user) { S.user = null; stopCounter(); render(); }
  if (!r.ok) throw new Error(j.error || 'Fehler ' + r.status);
  return j;
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

// ---------- Start ----------
async function boot() {
  const st = await api('GET', '/api/state');
  S.user = st.user; S.activities = st.activities; S.needsSetup = st.needsSetup;
  if (S.user) await loadTab();
  render();
}
async function loadTab() {
  if (S.tab === 'heute' || S.tab === 'training') S.day = await api('GET', '/api/day?date=' + S.date);
  if (S.tab === 'familie') S.family = await api('GET', '/api/family?date=' + S.date);
  if (S.tab === 'verlauf') S.history = await api('GET', '/api/history?days=14&end=' + today());
  if (S.tab === 'admin') S.users = (await api('GET', '/api/users')).users;
}

// ---------- Render ----------
function render() {
  if (!S.user) return renderLogin();
  const tabs = [['heute', '🏠', 'Heute'], ['training', '💪', 'Training'], ['familie', '👨‍👩‍👧', 'Familie'], ['verlauf', '📈', 'Verlauf'], ['profil', '👤', 'Profil']];
  if (S.user.role === 'admin') tabs.push(['admin', '🛠️', 'Admin']);
  const views = { heute: vHeute, training: vTraining, familie: vFamilie, verlauf: vVerlauf, profil: vProfil, admin: vAdmin };
  $app.innerHTML = `<div class="wrap">
    <div class="top"><div class="who">${avatar(S.user)}<div><b>Hallo ${esc(S.user.name)}</b><div class="muted">${S.user.role === 'admin' ? 'Admin' : 'Mitglied'}</div></div></div>
    <button class="sec small" id="logout">Abmelden</button></div>
    ${views[S.tab]()}</div>
    <nav class="tabs">${tabs.map(([k, i, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  document.getElementById('logout').onclick = guard(async () => { await api('POST', '/api/logout'); stopCounter(); S.user = null; render(); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = guard(async () => { S.tab = b.dataset.tab; await loadTab(); render(); }));
  bind[S.tab] && bind[S.tab]();
}

function renderLogin() {
  const setup = S.needsSetup;
  $app.innerHTML = `<div class="login"><div class="card"><h1>🏃 Familien-Fitness</h1>
    <p class="muted">${setup ? 'Willkommen! Lege jetzt das Admin-Konto an. Du bekommst damit volle Verwaltungsrechte.' : 'Nur für die Familie. Bitte anmelden.'}</p>
    <form id="f">
      ${setup ? '<label>Dein Name</label><input name="name" required maxlength="40" autocomplete="name">' : ''}
      <label>Benutzername</label><input name="username" required autocapitalize="none" autocomplete="username">
      <label>Passwort${setup ? ' (mind. 6 Zeichen)' : ''}</label><input name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}">
      <div class="err" id="err"></div>
      <button style="width:100%;margin-top:8px">${setup ? 'Admin-Konto erstellen' : 'Anmelden'}</button>
    </form></div></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api('POST', setup ? '/api/setup' : '/api/login', b);
      S.user = r.user; S.needsSetup = false; S.tab = 'heute'; S.date = today(); await loadTab(); render();
    } catch (er) { document.getElementById('err').textContent = er.message; }
  };
}

function dateNav() {
  return `<div class="datenav"><button class="sec small" id="prev" aria-label="Vortag">‹</button><b>${niceDate(S.date)}</b>
    <button class="sec small" id="next" aria-label="Folgetag" ${S.date >= today() ? 'disabled' : ''}>›</button></div>`;
}
function bindDateNav() {
  document.getElementById('prev').onclick = guard(async () => { S.date = shift(S.date, -1); await loadTab(); render(); });
  document.getElementById('next').onclick = guard(async () => { if (S.date < today()) { S.date = shift(S.date, 1); await loadTab(); render(); } });
}
function ring(steps, goal) {
  const p = Math.min(1, steps / goal), R = 88, C = 2 * Math.PI * R;
  return `<div class="ring"><svg width="200" height="200"><circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--line)" stroke-width="16"/>
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="${p >= 1 ? 'var(--brand)' : 'var(--brand2)'}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>
    <div class="c"><b>${fmt(steps)}</b><span class="muted">von ${fmt(goal)} Schritten</span><span>${p >= 1 ? '🎉 Ziel erreicht!' : Math.round(p * 100) + ' %'}</span></div></div>`;
}

// ---------- Ansichten ----------
const bind = {};
function vHeute() {
  const d = S.day; if (!d) return '';
  return `${dateNav()}<div class="card">${ring(d.steps, S.user.goal)}
    <div class="grid"><div class="stat"><b>${fmt(d.kcal)}</b><span>kcal verbrannt</span></div>
    <div class="stat"><b>${fmt(d.km, 2)}</b><span>km Strecke</span></div>
    <div class="stat"><b>${d.workouts.length}</b><span>Workouts</span></div></div>
    <p class="muted" style="margin:12px 0 0">Schritte ${fmt(d.stepKcal)} kcal + Training ${fmt(d.workoutKcal)} kcal</p></div>
  <div class="card"><h2>Schrittzähler (Handy-Sensor)</h2>
    <div class="live" id="live">${S.counter ? fmt(S.counter.count) : '0'}</div>
    <p class="muted" style="text-align:center;margin:0 0 10px">Zählt nur, solange diese Seite geöffnet und der Bildschirm an ist.</p>
    <div class="row"><button class="grow" id="cnt">${S.counter ? '⏹ Stoppen & speichern' : '▶ Zählen starten'}</button></div></div>
  <div class="card"><h2>Schritte eintragen</h2>
    <p class="muted">Z. B. aus der Fitness-/Gesundheits-App oder von der Uhr übernehmen.</p>
    <div class="row"><input id="stepsIn" type="number" inputmode="numeric" min="0" max="200000" placeholder="Gesamtschritte ${niceDate(S.date).toLowerCase()}" value="${d.steps || ''}"><button id="stepsSet">Speichern</button></div>
    <div class="row wrap2" style="margin-top:10px"><button class="sec small" data-add="500">+500</button><button class="sec small" data-add="1000">+1.000</button><button class="sec small" data-add="2000">+2.000</button><button class="sec small" data-add="-500">−500</button></div></div>`;
}
bind.heute = () => {
  bindDateNav();
  document.getElementById('stepsSet').onclick = guard(async () => {
    const v = document.getElementById('stepsIn').value; if (v === '') return toast('Bitte Zahl eingeben');
    S.day = await api('PUT', '/api/steps', { date: S.date, steps: Number(v) }); render(); toast('Gespeichert ✓');
  });
  document.querySelectorAll('[data-add]').forEach((b) => b.onclick = guard(async () => {
    S.day = await api('POST', '/api/steps/add', { date: S.date, delta: Number(b.dataset.add) }); render();
  }));
  document.getElementById('cnt').onclick = guard(async () => { if (S.counter) await stopCounter(true); else await startCounter(); render(); });
};

function vTraining() {
  const d = S.day; if (!d) return '';
  const opts = S.activities.map((a) => `<option value="${a.key}">${esc(a.name)}</option>`).join('');
  const name = (k) => (S.activities.find((a) => a.key === k) || {}).name || k;
  return `${dateNav()}<div class="card"><h2>Workout hinzufügen</h2>
    <label>Aktivität</label><select id="wType">${opts}</select>
    <label>Dauer (Minuten)</label><input id="wMin" type="number" inputmode="numeric" min="1" max="720" value="30">
    <label>Notiz (optional)</label><input id="wNote" maxlength="100" placeholder="z. B. Runde am Rhein">
    <p class="muted" id="wPrev"></p><button id="wAdd" style="width:100%">Hinzufügen</button></div>
  <div class="card"><h2>${niceDate(S.date)}: Workouts</h2>${d.workouts.length ? d.workouts.map((w) => `<div class="item"><div class="grow"><b>${esc(name(w.type))}</b> · ${w.minutes} min<div class="muted">${esc(w.note || '')}</div></div><b>${fmt(w.kcal)} kcal</b><button class="danger small" data-del="${w.id}" aria-label="Löschen">✕</button></div>`).join('') : '<p class="muted">Noch nichts eingetragen.</p>'}</div>`;
}
bind.training = () => {
  bindDateNav();
  const prev = () => {
    const a = S.activities.find((x) => x.key === document.getElementById('wType').value), m = Number(document.getElementById('wMin').value) || 0;
    document.getElementById('wPrev').textContent = a ? `≈ ${fmt(a.met * S.user.weightKg * m / 60)} kcal (bei ${S.user.weightKg} kg)` : '';
  };
  ['wType', 'wMin'].forEach((id) => document.getElementById(id).oninput = prev); prev();
  document.getElementById('wAdd').onclick = guard(async () => {
    S.day = await api('POST', '/api/workouts', { date: S.date, type: document.getElementById('wType').value, minutes: Number(document.getElementById('wMin').value), note: document.getElementById('wNote').value });
    render(); toast('Workout gespeichert ✓');
  });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = guard(async () => { S.day = await api('DELETE', '/api/workouts/' + b.dataset.del); render(); }));
};

function vFamilie() {
  const f = S.family; if (!f) return '';
  const total = f.members.reduce((a, m) => a + m.steps, 0);
  return `${dateNav()}<div class="card"><h2>Schritte der Familie</h2><p class="muted">Zusammen ${niceDate(S.date).toLowerCase()}: <b>${fmt(total)}</b> Schritte</p>
    ${f.members.map((m, i) => `<div class="member"><div class="row">${avatar(m)}<div class="grow"><b>${i === 0 && m.steps > 0 ? '🥇 ' : ''}${esc(m.name)}</b>${m.role === 'admin' ? '<span class="badge">Admin</span>' : ''}${m.id === S.user.id ? ' <span class="pill">du</span>' : ''}
      <div class="muted">${fmt(m.km, 1)} km · ${fmt(m.kcal)} kcal · 7 Tage: ${fmt(m.weekSteps)}</div></div><b>${fmt(m.steps)}</b></div>
      <div class="bar" style="margin-top:8px"><i class="${m.steps >= m.goal ? 'done' : ''}" style="width:${Math.min(100, m.steps / m.goal * 100)}%"></i></div></div>`).join('')}</div>`;
}
bind.familie = () => bindDateNav();

function vVerlauf() {
  const h = S.history; if (!h) return '';
  const max = Math.max(S.user.goal, ...h.days.map((d) => d.steps));
  const sum = h.days.reduce((a, d) => ({ s: a.s + d.steps, k: a.k + d.kcal }), { s: 0, k: 0 });
  const hit = h.days.filter((d) => d.steps >= S.user.goal).length;
  return `<div class="card"><h2>Letzte 14 Tage</h2><div class="grid">
    <div class="stat"><b>${fmt(sum.s / h.days.length)}</b><span>Ø Schritte/Tag</span></div>
    <div class="stat"><b>${fmt(sum.k / h.days.length)}</b><span>Ø kcal/Tag</span></div>
    <div class="stat"><b>${hit}/14</b><span>Tage Ziel erreicht</span></div></div>
    <div class="chart">${h.days.map((d) => `<div title="${d.date}: ${d.steps}"><i class="${d.steps >= S.user.goal ? 'hit' : ''}" style="height:${d.steps / max * 100}%"></i>${d.date.slice(8)}</div>`).join('')}</div>
    <p class="muted">Dunkle Balken = Tagesziel (${fmt(S.user.goal)}) erreicht.</p></div>
  <div class="card"><h2>Tage</h2>${[...h.days].reverse().map((d) => `<div class="item"><div class="grow"><b>${niceDate(d.date)}</b></div><span>${fmt(d.steps)} Schritte</span><b>${fmt(d.kcal)} kcal</b></div>`).join('')}</div>`;
}

function profileFields(u, prefix) {
  return `<label>Name</label><input id="${prefix}name" value="${esc(u.name)}" maxlength="40">
  <div class="grid"><div><label>Gewicht (kg)</label><input id="${prefix}w" type="number" step="0.1" value="${u.weightKg}"></div>
  <div><label>Größe (cm)</label><input id="${prefix}h" type="number" value="${u.heightCm}"></div>
  <div><label>Alter</label><input id="${prefix}a" type="number" value="${u.age}"></div></div>
  <label>Tagesziel Schritte</label><input id="${prefix}g" type="number" step="500" value="${u.goal}">`;
}
const readFields = (p) => ({ name: val(p + 'name'), weightKg: val(p + 'w'), heightCm: val(p + 'h'), age: val(p + 'a'), goal: val(p + 'g') });
const val = (id) => document.getElementById(id).value;

function vProfil() {
  return `<div class="card"><h2>Mein Profil</h2><p class="muted">Gewicht und Größe werden für Kalorien und Strecke gebraucht.</p>${profileFields(S.user, 'p')}
    <button id="pSave" style="width:100%;margin-top:14px">Speichern</button></div>
  <div class="card"><h2>Passwort ändern</h2><label>Aktuelles Passwort</label><input id="pOld" type="password" autocomplete="current-password">
    <label>Neues Passwort (mind. 6 Zeichen)</label><input id="pNew" type="password" autocomplete="new-password"><button class="sec" id="pPw" style="width:100%;margin-top:14px">Passwort ändern</button></div>
  <p class="muted">Benutzername: <b>${esc(S.user.username)}</b></p>`;
}
bind.profil = () => {
  document.getElementById('pSave').onclick = guard(async () => { S.user = (await api('PUT', '/api/me', readFields('p'))).user; render(); toast('Profil gespeichert ✓'); });
  document.getElementById('pPw').onclick = guard(async () => { await api('PUT', '/api/me', { oldPassword: val('pOld'), newPassword: val('pNew') }); render(); toast('Passwort geändert ✓'); });
};

function vAdmin() {
  const us = S.users || [];
  return `<div class="card"><h2>Neues Familienmitglied</h2><p class="muted">Lege den Zugang an und gib Benutzername + Startpasswort weiter.</p>
    <label>Name</label><input id="nName" maxlength="40"><label>Benutzername (a–z, 0–9)</label><input id="nUser" autocapitalize="none">
    <label>Startpasswort (mind. 6 Zeichen)</label><input id="nPw"><label>Rolle</label><select id="nRole"><option value="member">Mitglied</option><option value="admin">Admin</option></select>
    <button id="nAdd" style="width:100%;margin-top:14px">Zugang erstellen</button></div>
  <div class="card"><h2>Alle Mitglieder (${us.length})</h2>${us.map((u) => `<div class="item">${avatar(u)}<div class="grow"><b>${esc(u.name)}</b>${u.role === 'admin' ? '<span class="badge">Admin</span>' : ''}<div class="muted">@${esc(u.username)}</div></div>
    <button class="sec small" data-edit="${u.id}">Bearbeiten</button></div><div id="ed-${u.id}"></div>`).join('')}</div>`;
}
bind.admin = () => {
  document.getElementById('nAdd').onclick = guard(async () => {
    await api('POST', '/api/users', { name: val('nName'), username: val('nUser'), password: val('nPw'), role: val('nRole') });
    S.users = (await api('GET', '/api/users')).users; render(); toast('Zugang erstellt ✓');
  });
  document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
    const u = S.users.find((x) => x.id === b.dataset.edit), box = document.getElementById('ed-' + u.id);
    if (box.innerHTML) { box.innerHTML = ''; return; }
    const p = 'e' + u.id;
    box.innerHTML = `<div class="card" style="background:var(--bg)">${profileFields(u, p)}<label>Rolle</label><select id="${p}r"><option value="member" ${u.role === 'member' ? 'selected' : ''}>Mitglied</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select>
      <label>Neues Passwort setzen (leer lassen = unverändert)</label><input id="${p}pw">
      <div class="row" style="margin-top:12px"><button class="grow" id="${p}s">Speichern</button>${u.id !== S.user.id ? `<button class="danger" id="${p}d">Löschen</button>` : ''}</div></div>`;
    document.getElementById(p + 's').onclick = guard(async () => {
      await api('PUT', '/api/users/' + u.id, Object.assign(readFields(p), { role: val(p + 'r'), password: val(p + 'pw') || undefined }));
      S.users = (await api('GET', '/api/users')).users; if (u.id === S.user.id) S.user = S.users.find((x) => x.id === u.id); render(); toast('Gespeichert ✓');
    });
    const d = document.getElementById(p + 'd');
    if (d) d.onclick = guard(async () => {
      if (!confirm(`${u.name} und alle Daten wirklich löschen?`)) return;
      await api('DELETE', '/api/users/' + u.id); S.users = (await api('GET', '/api/users')).users; render(); toast('Gelöscht');
    });
  });
};

// ---------- Schrittzähler per Bewegungssensor ----------
async function startCounter() {
  if (typeof DeviceMotionEvent === 'undefined') return toast('Dieses Gerät hat keinen Bewegungssensor. Bitte Schritte manuell eintragen.');
  if (typeof DeviceMotionEvent.requestPermission === 'function') {      // iOS
    const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return toast('Zugriff auf Bewegungssensor verweigert');
  }
  const c = S.counter = { count: 0, saved: 0, last: 0, avg: 9.8, prev: 0, rising: false, got: false, date: S.date };
  c.handler = (e) => {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    c.got = true;
    const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    c.avg += (m - c.avg) * 0.05;                      // Schwerkraft-Mittelwert
    const v = m - c.avg, now = Date.now();
    if (v > 1.3 && c.prev <= 1.3 && now - c.last > 330) { c.count++; c.last = now; const l = document.getElementById('live'); if (l) l.textContent = fmt(c.count); }
    c.prev = v;
  };
  window.addEventListener('devicemotion', c.handler);
  c.timer = setInterval(() => flushCounter().catch(() => {}), 15000);
  setTimeout(() => { if (S.counter === c && !c.got) { toast('Keine Sensordaten – bitte Schritte manuell eintragen.'); stopCounter(); render(); } }, 3000);
  toast('Zählt … Handy in der Tasche oder Hand tragen');
}
async function flushCounter() {
  const c = S.counter; if (!c || c.count === c.saved) return;
  const delta = c.count - c.saved; c.saved = c.count;
  try { await api('POST', '/api/steps/add', { date: c.date, delta }); } catch (e) { c.saved -= delta; throw e; }
}
async function stopCounter(save) {
  const c = S.counter; if (!c) return;
  window.removeEventListener('devicemotion', c.handler); clearInterval(c.timer);
  if (save !== false) await flushCounter().catch(() => {});
  S.counter = null;
  if (save) { S.day = await api('GET', '/api/day?date=' + S.date); toast(`${fmt(c.count)} Schritte gespeichert ✓`); }
}

boot().catch((e) => { $app.innerHTML = '<div class="wrap"><p>Server nicht erreichbar: ' + esc(e.message) + '</p></div>'; });
