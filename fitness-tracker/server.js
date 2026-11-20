'use strict';
// Familien-Fitness-Tracker – Server ohne externe Abhängigkeiten (nur Node.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_MS = 30 * 24 * 3600 * 1000;

// ---------- Datenbank (JSON-Datei, atomar geschrieben) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: [], steps: {}, workouts: [], sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { /* neu */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}
process.on('SIGINT', () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) {} process.exit(0); });
process.on('SIGTERM', () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) {} process.exit(0); });

// ---------- Hilfsfunktionen ----------
const ACTIVITIES = {
  gehen: ['Spazieren / Gehen', 3.5], wandern: ['Wandern', 6],
  laufen: ['Laufen / Joggen', 9.8], radfahren: ['Radfahren', 7.5],
  schwimmen: ['Schwimmen', 7], kraft: ['Krafttraining', 5],
  hiit: ['HIIT / Zirkeltraining', 8.5], yoga: ['Yoga / Dehnen', 2.8],
  fussball: ['Fußball', 8], tanzen: ['Tanzen', 5.5],
  treppen: ['Treppensteigen', 8.8], haushalt: ['Garten / Hausarbeit', 3.8],
};
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d) => typeof d === 'string' && dateRe.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, d) => { v = Number(v); return Number.isFinite(v) ? v : d; };
const newId = () => crypto.randomBytes(8).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return salt.toString('hex') + ':' + key.toString('hex');
}
async function checkPw(pw, stored) {
  const [s, k] = String(stored).split(':');
  const key = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  const kb = Buffer.from(k, 'hex');
  return kb.length === key.length && crypto.timingSafeEqual(kb, key);
}

function stepKcal(u, steps) {
  const stride = (u.heightCm || 170) * 0.415 / 100;       // m pro Schritt
  const km = steps * stride / 1000;
  return km * (u.weightKg || 70) * 0.53;                   // ~0,53 kcal pro kg und km beim Gehen
}
const stepKm = (u, steps) => steps * (u.heightCm || 170) * 0.415 / 100 / 1000;
const workoutKcal = (u, type, min) => (ACTIVITIES[type] ? ACTIVITIES[type][1] : 4) * (u.weightKg || 70) * (min / 60);

function dayStats(u, date) {
  const steps = (db.steps[u.id] || {})[date] || 0;
  const ws = db.workouts.filter((w) => w.userId === u.id && w.date === date);
  const wk = ws.reduce((a, w) => a + w.kcal, 0);
  const sk = stepKcal(u, steps);
  return { date, steps, km: stepKm(u, steps), stepKcal: sk, workoutKcal: wk, kcal: sk + wk, workouts: ws };
}
const publicUser = (u) => ({
  id: u.id, name: u.name, username: u.username, role: u.role,
  weightKg: u.weightKg, heightCm: u.heightCm, age: u.age, sex: u.sex, goal: u.goal,
});
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- HTTP-Grundlagen ----------
const attempts = new Map(); // Login-Schutz
// Hinter einem Hosting-Proxy (TRUST_PROXY=1) steht die echte Client-IP im X-Forwarded-For-Header.
const clientIp = (req) => (process.env.TRUST_PROXY === '1' && (req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress;
function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(body);
}
const fail = (res, code, msg) => send(res, code, { error: msg });
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 100000) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(new Error('Ungültiges JSON')); } });
  });
}
function getSession(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = db.sessions[hashToken(m[1])];
  if (!s || s.exp < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}
function cookie(req, token, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
async function startSession(req, res, user, extra = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[hashToken(token)] = { userId: user.id, exp: Date.now() + SESSION_MS };
  save();
  send(res, 200, Object.assign({ user: publicUser(user) }, extra), { 'Set-Cookie': cookie(req, token, SESSION_MS / 1000) });
}
function dropSessions(userId) {
  for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === userId) delete db.sessions[k];
}

function readProfile(u, b) {
  if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 40); if (n) u.name = n; }
  if (b.weightKg !== undefined) u.weightKg = clamp(num(b.weightKg, u.weightKg), 20, 300);
  if (b.heightCm !== undefined) u.heightCm = clamp(num(b.heightCm, u.heightCm), 80, 250);
  if (b.age !== undefined) u.age = clamp(Math.round(num(b.age, u.age)), 1, 120);
  if (b.sex !== undefined && ['m', 'w', 'd'].includes(b.sex)) u.sex = b.sex;
  if (b.goal !== undefined) u.goal = clamp(Math.round(num(b.goal, u.goal)), 1000, 100000);
}
function newUser(name, username, role, hash) {
  return { id: newId(), name, username, role, hash, weightKg: 70, heightCm: 170, age: 30, sex: 'd', goal: 10000, created: Date.now() };
}
function checkNewCreds(username, password) {
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) return 'Benutzername: 3–20 Zeichen (a–z, 0–9, . _ -)';
  if (typeof password !== 'string' || password.length < 6) return 'Passwort muss mindestens 6 Zeichen haben';
  if (db.users.some((u) => u.username === username)) return 'Benutzername ist schon vergeben';
  return null;
}

// ---------- API ----------
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (req.method !== 'GET' && !/application\/json/.test(req.headers['content-type'] || '') && req.method !== 'DELETE')
    return fail(res, 415, 'JSON erwartet');
  const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
  const me = getSession(req);

  if (route === 'GET /api/state') {
    return send(res, 200, { needsSetup: db.users.length === 0, user: me ? publicUser(me) : null, activities: Object.entries(ACTIVITIES).map(([k, v]) => ({ key: k, name: v[0], met: v[1] })) });
  }
  if (route === 'POST /api/setup') {            // erster Start: Admin anlegen
    if (db.users.length) return fail(res, 403, 'Bereits eingerichtet');
    const username = String(body.username || '').trim().toLowerCase();
    const err = checkNewCreds(username, body.password);
    if (err) return fail(res, 400, err);
    const u = newUser(String(body.name || username).trim().slice(0, 40), username, 'admin', await hashPw(body.password));
    db.users.push(u); save();
    return startSession(req, res, u);
  }
  if (route === 'POST /api/login') {
    const username = String(body.username || '').trim().toLowerCase();
    const key = clientIp(req) + '|' + username;
    const a = attempts.get(key) || { n: 0, until: 0 };
    if (a.until > Date.now()) return fail(res, 429, 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.');
    const u = db.users.find((x) => x.username === username);
    const ok = u && await checkPw(String(body.password || ''), u.hash);
    if (!ok) {
      a.n++; if (a.n >= 5) { a.until = Date.now() + 5 * 60000; a.n = 0; }
      attempts.set(key, a);
      return fail(res, 401, 'Benutzername oder Passwort falsch');
    }
    attempts.delete(key);
    return startSession(req, res, u);
  }
  if (route === 'POST /api/logout') {
    const m = /sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m) { delete db.sessions[hashToken(m[1])]; save(); }
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  }

  if (!me) return fail(res, 401, 'Bitte anmelden');

  if (route === 'PUT /api/me') {
    readProfile(me, body);
    if (body.newPassword) {
      if (!(await checkPw(String(body.oldPassword || ''), me.hash))) return fail(res, 400, 'Aktuelles Passwort stimmt nicht');
      if (String(body.newPassword).length < 6) return fail(res, 400, 'Neues Passwort: mindestens 6 Zeichen');
      me.hash = await hashPw(String(body.newPassword));
    }
    save(); return send(res, 200, { user: publicUser(me) });
  }

  if (route === 'GET /api/day') {
    const date = url.searchParams.get('date');
    if (!validDate(date)) return fail(res, 400, 'Datum ungültig');
    return send(res, 200, dayStats(me, date));
  }
  if (route === 'PUT /api/steps' || route === 'POST /api/steps/add') {
    if (!validDate(body.date)) return fail(res, 400, 'Datum ungültig');
    const cur = (db.steps[me.id] = db.steps[me.id] || {});
    const v = Math.round(num(body.steps ?? body.delta, NaN));
    if (!Number.isFinite(v)) return fail(res, 400, 'Zahl ungültig');
    cur[body.date] = clamp(route === 'PUT /api/steps' ? v : (cur[body.date] || 0) + v, 0, 200000);
    save(); return send(res, 200, dayStats(me, body.date));
  }
  if (route === 'POST /api/workouts') {
    if (!validDate(body.date)) return fail(res, 400, 'Datum ungültig');
    if (!ACTIVITIES[body.type]) return fail(res, 400, 'Unbekannte Aktivität');
    const minutes = Math.round(num(body.minutes, 0));
    if (minutes < 1 || minutes > 720) return fail(res, 400, 'Dauer: 1–720 Minuten');
    db.workouts.push({ id: newId(), userId: me.id, date: body.date, type: body.type, minutes, note: String(body.note || '').slice(0, 100), kcal: Math.round(workoutKcal(me, body.type, minutes)) });
    save(); return send(res, 200, dayStats(me, body.date));
  }
  let m = /^\/api\/workouts\/([a-f0-9]+)$/.exec(url.pathname);
  if (m && req.method === 'DELETE') {
    const i = db.workouts.findIndex((w) => w.id === m[1] && w.userId === me.id);
    if (i < 0) return fail(res, 404, 'Nicht gefunden');
    const date = db.workouts[i].date; db.workouts.splice(i, 1); save();
    return send(res, 200, dayStats(me, date));
  }
  if (route === 'GET /api/history') {
    const days = clamp(Math.round(num(url.searchParams.get('days'), 7)), 1, 90);
    const end = url.searchParams.get('end');
    if (!validDate(end)) return fail(res, 400, 'Datum ungültig');
    const out = [];
    for (let i = days - 1; i >= 0; i--) { const s = dayStats(me, addDays(end, -i)); delete s.workouts; out.push(s); }
    return send(res, 200, { days: out });
  }
  if (route === 'GET /api/family') {   // Alle Mitglieder sehen die Tagesschritte aller anderen
    const date = url.searchParams.get('date');
    if (!validDate(date)) return fail(res, 400, 'Datum ungültig');
    const list = db.users.map((u) => {
      const d = dayStats(u, date);
      let week = 0; for (let i = 0; i < 7; i++) week += dayStats(u, addDays(date, -i)).steps;
      return { id: u.id, name: u.name, role: u.role, goal: u.goal, steps: d.steps, km: d.km, kcal: Math.round(d.kcal), weekSteps: week };
    }).sort((a, b) => b.steps - a.steps);
    return send(res, 200, { date, members: list });
  }

  // ---------- Admin ----------
  if (url.pathname.startsWith('/api/users')) {
    if (me.role !== 'admin') return fail(res, 403, 'Nur für Admins');
    if (route === 'GET /api/users') return send(res, 200, { users: db.users.map(publicUser) });
    if (route === 'POST /api/users') {
      const username = String(body.username || '').trim().toLowerCase();
      const err = checkNewCreds(username, body.password);
      if (err) return fail(res, 400, err);
      const role = body.role === 'admin' ? 'admin' : 'member';
      const u = newUser(String(body.name || username).trim().slice(0, 40), username, role, await hashPw(body.password));
      readProfile(u, body); db.users.push(u); save();
      return send(res, 200, { user: publicUser(u) });
    }
    m = /^\/api\/users\/([a-f0-9]+)$/.exec(url.pathname);
    if (m) {
      const u = db.users.find((x) => x.id === m[1]);
      if (!u) return fail(res, 404, 'Nicht gefunden');
      const admins = db.users.filter((x) => x.role === 'admin').length;
      if (req.method === 'PUT') {
        readProfile(u, body);
        if (body.role && body.role !== u.role) {
          if (u.role === 'admin' && admins <= 1) return fail(res, 400, 'Es muss mindestens ein Admin bleiben');
          u.role = body.role === 'admin' ? 'admin' : 'member';
        }
        if (body.password) {
          if (String(body.password).length < 6) return fail(res, 400, 'Passwort: mindestens 6 Zeichen');
          u.hash = await hashPw(String(body.password)); dropSessions(u.id);
        }
        save(); return send(res, 200, { user: publicUser(u) });
      }
      if (req.method === 'DELETE') {
        if (u.id === me.id) return fail(res, 400, 'Du kannst dich nicht selbst löschen');
        if (u.role === 'admin' && admins <= 1) return fail(res, 400, 'Es muss mindestens ein Admin bleiben');
        db.users = db.users.filter((x) => x.id !== u.id); delete db.steps[u.id];
        db.workouts = db.workouts.filter((w) => w.userId !== u.id); dropSessions(u.id); save();
        return send(res, 200, { ok: true });
      }
    }
  }
  return fail(res, 404, 'Unbekannte Route');
}

// ---------- Statische Dateien ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, 400, e.message || 'Fehler'); else res.end();
  }
}).listen(PORT, () => console.log(`Familien-Fitness-Tracker läuft auf http://localhost:${PORT}`));
