const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || process.env.WPP_PORT || 8788);
const HOST = process.env.WPP_HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.WPP_CORS_ORIGIN || 'https://iatimcll-blip.github.io';
const NOTIFY_FILE = process.env.WPP_NOTIFY_FILE || path.join(__dirname, '.jarvis-notify.json');
const CLIENT_ID = process.env.WPP_CLIENT_ID || 'jarvis';
const AUTH_DIR = process.env.WPP_AUTH_DIR || path.join(__dirname, '.wwebjs_auth');

fs.mkdirSync(AUTH_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Allow HTTPS pages (GitHub Pages) to reach the local bridge via Chrome Private Network Access.
// Must run BEFORE cors(), since cors() answers OPTIONS preflights itself and never calls next().
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
const ALLOWED = CORS_ORIGIN === '*' ? null : CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
app.use(cors({
  origin(origin, cb) {
    // sem Origin (curl/serviço local), página local (file:// = "null") ou origem liberada
    if (!ALLOWED || !origin || origin === 'null' || LOCAL_ORIGIN.test(origin) || ALLOWED.includes(origin)) return cb(null, true);
    cb(null, false);
  }
}));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.method !== 'GET' && req.method !== 'OPTIONS' && ALLOWED && origin && origin !== 'null' && !LOCAL_ORIGIN.test(origin) && !ALLOWED.includes(origin)) {
    res.status(403).json({ error: 'Origem não autorizada.' });
    return;
  }
  next();
});
const jsonPequeno = express.json({ limit: '1mb' }), jsonMidia = express.json({ limit: '90mb' });
app.use((req, res, next) => (req.path === '/api/send-media' ? jsonMidia : jsonPequeno)(req, res, next));

let client;
let initializing = false;
const contactCache = new Map();
const state = {
  status: 'starting',
  qr: '',
  qrText: '',
  me: null,
  lastError: '',
  unread: 0,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function touch() {
  state.updatedAt = new Date().toISOString();
}

function publicState() {
  return { ...state, hasQr: !!state.qr };
}

function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, ...payload, state: publicState() });
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function setStatus(status, extra = {}) {
  Object.assign(state, extra, { status });
  touch();
  broadcast('status');
}

function summarizeChat(chat) {
  return {
    id: chat.id && chat.id._serialized,
    name: chat.name || chat.formattedTitle || chat.id?.user || 'Sem nome',
    isGroup: !!chat.isGroup,
    unreadCount: chat.unreadCount || 0,
    timestamp: chat.timestamp || 0,
    archived: !!chat.archived,
    pinned: !!chat.pinned,
    lastMessage: chat.lastMessage ? {
      body: chat.lastMessage.body || '',
      fromMe: !!chat.lastMessage.fromMe,
      timestamp: chat.lastMessage.timestamp || 0
    } : null
  };
}

async function contactSummary(id) {
  const key = String(id || '').trim();
  if (!key || !client) return { id: key, name: '', number: '' };
  if (contactCache.has(key)) return contactCache.get(key);
  try {
    const contact = await client.getContactById(key);
    const item = {
      id: key,
      name: contact.name || contact.pushname || contact.shortName || contact.number || key.replace(/@.+$/, ''),
      number: contact.number || key.replace(/@.+$/, '')
    };
    contactCache.set(key, item);
    return item;
  } catch (_err) {
    const item = { id: key, name: key.replace(/@.+$/, ''), number: key.replace(/@.+$/, '') };
    contactCache.set(key, item);
    return item;
  }
}

async function summarizeMessage(message, withQuote = true) {
  const senderId = message.author || (message.fromMe ? message.to : message.from) || '';
  const sender = await contactSummary(senderId);
  let quoted = null;
  if (withQuote && message.hasQuotedMsg) {
    try {
      const q = await message.getQuotedMessage();
      if (q) {
        const qs = await contactSummary(q.author || (q.fromMe ? (client.info && client.info.wid && client.info.wid._serialized) : q.from) || '');
        quoted = { id: q.id && q.id._serialized, body: (q.body || '').slice(0, 300), type: q.type || 'chat', fromMe: !!q.fromMe, senderName: q.fromMe ? 'Você' : (qs.name || '') };
      }
    } catch (_e) { /* citação indisponível */ }
  }
  return {
    ack: typeof message.ack === 'number' ? message.ack : null,
    quoted,
    isForwarded: !!message.isForwarded,
    filename: (message._data && message._data.filename) || '',
    id: message.id && message.id._serialized,
    from: message.from,
    to: message.to,
    author: message.author || '',
    senderId,
    senderName: sender.name || '',
    senderNumber: sender.number || '',
    body: message.body || '',
    fromMe: !!message.fromMe,
    timestamp: message.timestamp || 0,
    type: message.type || 'chat',
    hasMedia: !!message.hasMedia
  };
}

// Depois do 1º login o WhatsApp Web recarrega a página e o script injetado (window.WWebJS) some:
// chamadas falham com "reading 'getChats'". Reinicia o cliente com a sessão salva (sem novo QR).
function falhaDeInjecao(err) {
  const m = String(err && err.message || err);
  if (/WWebJS|reading 'getChats'|Execution context was destroyed|detached Frame/i.test(m)) { console.error('Injeção perdida — reiniciando cliente:', m); scheduleRestart(1500); return true; }
  return false;
}

function requireReady(res) {
  if (!client || state.status !== 'ready') {
    res.status(409).json({ error: 'WhatsApp ainda não conectado. Leia o QR Code primeiro.', state: publicState() });
    return false;
  }
  return true;
}

async function startClient() {
  if (initializing) return;
  initializing = true;
  setStatus('starting', { lastError: '' });

  client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer'
      ]
    }
  });

  client.on('qr', async qr => {
    try {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      setStatus('qr', { qr: dataUrl, qrText: qr, lastError: '' });
    } catch (err) {
      setStatus('error', { lastError: 'Falha ao gerar QR Code: ' + err.message });
    }
  });

  client.on('authenticated', () => setStatus('authenticated', { qr: '', qrText: '' }));
  client.on('ready', () => {
    const info = client.info || {};
    setStatus('ready', {
      qr: '',
      qrText: '',
      me: {
        wid: info.wid && info.wid._serialized,
        pushname: info.pushname || '',
        platform: info.platform || ''
      }
    });
  });
  client.on('auth_failure', msg => {
    setStatus('auth_failure', { lastError: String(msg || 'Falha de autenticação') });
    scheduleRestart(3000);
  });
  client.on('disconnected', reason => {
    setStatus('disconnected', { lastError: String(reason || 'Sessão desconectada') });
    scheduleRestart(3000);
  });
  client.on('message', async message => {
    state.unread += 1;
    touch();
    broadcast('message', { message: await summarizeMessage(message) });
  });
  client.on('message_ack', (message, ack) => {
    broadcast('ack', { id: message.id && message.id._serialized, ack });
  });
  client.on('message_create', async message => {
    if (!message.fromMe) return;
    touch();
    broadcast('message_create', { message: await summarizeMessage(message) });
  });

  try {
    await client.initialize();
  } catch (err) {
    setStatus('error', { lastError: err.message || String(err) });
    scheduleRestart(15000); // ex.: 'Requesting main frame too early!' — tenta de novo sozinho
  } finally {
    initializing = false;
  }
}

// Self-healing: a corrupted/locked Chromium profile (common on Windows) can make
// whatsapp-web.js throw outside any try/catch we control. Without these handlers
// that throw would kill the whole process instead of just failing the connection.
let restartTimer = null;
async function restartClient() {
  const oldClient = client;
  client = null;
  initializing = false;
  if (oldClient) {
    oldClient.removeAllListeners();
    await oldClient.destroy().catch(() => {});
  }
  contactCache.clear();
  await startClient();
}
function scheduleRestart(delayMs = 5000) {
  if (restartTimer) return;
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    await restartClient();
  }, delayMs);
}
process.on('uncaughtException', err => {
  console.error('uncaughtException:', err);
  setStatus('error', { lastError: err.message || String(err) });
  scheduleRestart();
});
process.on('unhandledRejection', err => {
  console.error('unhandledRejection:', err);
  setStatus('error', { lastError: (err && err.message) || String(err) });
  scheduleRestart();
});

app.get('/', (_req, res) => res.json({ ok: true, service: 'jarvis-whatsapp-bridge', docs: ['/health', '/api/status', '/api/chats', '/api/groups', '/api/notify-config', '/api/notify'] }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'jarvis-whatsapp-bridge', authDir: AUTH_DIR, state: publicState() }));
app.get('/api/status', (_req, res) => res.json(publicState()));

app.post('/api/restart', async (_req, res) => {
  try {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    await restartClient();
    res.json(publicState());
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (_req, res) => {
  try {
    if (client) await client.logout();
    setStatus('disconnected', { me: null, qr: '', qrText: '' });
    res.json(publicState());
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats', async (_req, res) => {
  if (!requireReady(res)) return;
  try {
    const chats = await client.getChats();
    res.json(chats.map(summarizeChat).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100));
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/:id/messages', async (req, res) => {
  if (!requireReady(res)) return;
  try {
    const limit = Math.max(1, Math.min(300, Number(req.query.limit || 50)));
    const chat = await client.getChatById(req.params.id);
    const messages = await chat.fetchMessages({ limit });
    res.json(await Promise.all(messages.map(summarizeMessage)));
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats/:id/seen', async (req, res) => {
  if (!requireReady(res)) return;
  try {
    const chat = await client.getChatById(req.params.id);
    await chat.sendSeen();
    res.json({ ok: true });
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

const mediaCache = new Map(); // id -> { buf, type, at }
app.get('/api/media/:id', async (req, res) => {
  const id = String(req.params.id || '');
  const c = mediaCache.get(id);
  if (c) { res.set('Content-Type', c.type).set('Cache-Control', 'private, max-age=86400').send(c.buf); return; }
  if (!client || state.status !== 'ready') { res.status(404).end(); return; }
  try {
    const msg = await client.getMessageById(id);
    if (!msg || !msg.hasMedia || !['image', 'sticker'].includes(msg.type)) { res.status(404).end(); return; }
    const media = await msg.downloadMedia();
    if (!media || !media.data) { res.status(404).end(); return; }
    const buf = Buffer.from(media.data, 'base64');
    if (buf.length > 8 * 1024 * 1024) { res.status(413).end(); return; }
    if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value);
    mediaCache.set(id, { buf, type: media.mimetype || 'image/jpeg', at: Date.now() });
    res.set('Content-Type', media.mimetype || 'image/jpeg').set('Cache-Control', 'private, max-age=86400').send(buf);
  } catch (_err) {
    res.status(404).end();
  }
});

app.post('/api/send-media', async (req, res) => {
  if (!requireReady(res)) return;
  const to = String(req.body.to || '').trim();
  const data = String(req.body.data || '');
  const mimetype = String(req.body.mimetype || 'application/octet-stream').slice(0, 120);
  const filename = String(req.body.filename || 'arquivo').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 160);
  if (!to || !data) { res.status(400).json({ error: 'Informe to e data.' }); return; }
  try {
    const media = new MessageMedia(mimetype, data, filename);
    const tamanho = Math.floor(data.length * 3 / 4);
    const opts = {};
    const caption = String(req.body.caption || '').trim();
    if (caption) opts.caption = caption;
    const quotedMessageId = String(req.body.quotedMessageId || '').trim();
    if (quotedMessageId) opts.quotedMessageId = quotedMessageId;
    // foto/vídeo como mídia; o resto (ou vídeo grande) como documento
    const ehImg = /^image\/(jpeg|png|webp)$/i.test(mimetype), ehVid = /^video\/mp4$/i.test(mimetype);
    if (req.body.asDocument || (!ehImg && !(ehVid && tamanho <= 16 * 1024 * 1024))) opts.sendMediaAsDocument = true;
    const msg = await client.sendMessage(to, media, opts);
    res.json({ ok: true, message: await summarizeMessage(msg) });
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

// ── Encaminhar (2026-11-18): reenvia uma mensagem existente (texto ou mídia) para 1..20 conversas ──
app.post('/api/forward', async (req, res) => {
  if (!requireReady(res)) return;
  const messageId = String(req.body.messageId || '').trim();
  const destinos = (Array.isArray(req.body.to) ? req.body.to : [req.body.to]).map(x => String(x || '').trim()).filter(x => /@(c|g).us$/.test(x)).slice(0, 20);
  if (!messageId || !destinos.length) { res.status(400).json({ error: 'Informe messageId e to.' }); return; }
  try {
    const msg = await client.getMessageById(messageId);
    if (!msg) { res.status(404).json({ error: 'Mensagem não encontrada (pode ter sido apagada).' }); return; }
    const results = [];
    for (const to of destinos) {
      try { await msg.forward(to); results.push({ to, ok: true }); }
      catch (e) { results.push({ to, ok: false, error: e.message }); }
    }
    res.json({ ok: results.every(r => r.ok), results });
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  if (!requireReady(res)) return;
  const to = String(req.body.to || '').trim();
  const body = String(req.body.body || '').trim();
  if (!to || !body) {
    res.status(400).json({ error: 'Informe to e body.' });
    return;
  }
  try {
    const opts = {};
    const quotedMessageId = String(req.body.quotedMessageId || '').trim();
    if (quotedMessageId) opts.quotedMessageId = quotedMessageId;
    const msg = await client.sendMessage(to, body, opts);
    res.json({ ok: true, message: await summarizeMessage(msg) });
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

// ── Foto de perfil (2026-11-18): o painel mostra a foto original de cada contato/grupo ──
// A URL do WhatsApp (pps.whatsapp.net) expira; a ponte baixa e serve a imagem, com cache em memória.
const avatarCache = new Map(); // id -> { buf, type, at } | { none: true, at }
const AVATAR_TTL = 6 * 3600e3, AVATAR_NONE_TTL = 3600e3;
let avatarAtivos = 0; const avatarFila = [];
function avatarSlot() {
  if (avatarAtivos < 4) { avatarAtivos++; return Promise.resolve(); }
  return new Promise(r => avatarFila.push(r));
}
function avatarLibera() { const n = avatarFila.shift(); if (n) n(); else avatarAtivos--; }
app.get('/api/avatar/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[\w.-]+@(c|g)\.us$|^[\w.-]+@lid$/.test(id)) { res.status(400).end(); return; }
  const c = avatarCache.get(id), now = Date.now();
  if (c && c.none && now - c.at < AVATAR_NONE_TTL) { res.status(404).end(); return; }
  if (c && c.buf && now - c.at < AVATAR_TTL) { res.set('Content-Type', c.type).set('Cache-Control', 'private, max-age=3600').send(c.buf); return; }
  if (!client || state.status !== 'ready') { res.status(404).end(); return; }
  await avatarSlot();
  try {
    const url = await client.getProfilePicUrl(id).catch(() => '');
    if (!url) { avatarCache.set(id, { none: true, at: now }); res.status(404).end(); return; }
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()), type = r.headers.get('content-type') || 'image/jpeg';
    avatarCache.set(id, { buf, type, at: now });
    res.set('Content-Type', type).set('Cache-Control', 'private, max-age=3600').send(buf);
  } catch (_err) {
    avatarCache.set(id, { none: true, at: now });
    res.status(404).end();
  } finally { avatarLibera(); }
});

// ── Grupos principais para notificações (2026-11-18) ─────────────────────────
// Config local (não vai para o repositório): grupos escolhidos no painel, tipos ligados e
// chaves já enviadas — a mesma notificação disparada por vários navegadores/abas sai uma vez só.
// Fixar conversas e TAGs (2026-11-18): guardados aqui, junto da config, para valer em qualquer navegador deste PC.
const CHAT_ID_RE = /^[\w.-]+@(c|g)\.us$|^[\w.-]+@lid$/;
function normTags(t) {
  t = t && typeof t === 'object' ? t : {};
  const defs = (Array.isArray(t.defs) ? t.defs : []).filter(d => d && d.id && d.nome).map(d => ({
    id: String(d.id).replace(/[^\w-]/g, '').slice(0, 24), nome: String(d.nome).slice(0, 40),
    cor: /^#[0-9a-f]{6}$/i.test(String(d.cor || '')) ? String(d.cor) : '#64748b',
  })).filter(d => d.id).slice(0, 40);
  const ids = new Set(defs.map(d => d.id)), map = {};
  for (const [chat, lista] of Object.entries(t.map && typeof t.map === 'object' ? t.map : {})) {
    if (!CHAT_ID_RE.test(chat) || !Array.isArray(lista)) continue;
    const l = [...new Set(lista.map(String))].filter(x => ids.has(x)).slice(0, 10);
    if (l.length) map[chat] = l;
  }
  return { defs, map };
}
function loadNotify() {
  try {
    const j = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8'));
    return { groups: Array.isArray(j.groups) ? j.groups : [], monitor: Array.isArray(j.monitor) ? j.monitor : [], pins: Array.isArray(j.pins) ? j.pins : [], tags: normTags(j.tags), kinds: j.kinds || {}, sent: j.sent || {}, log: Array.isArray(j.log) ? j.log : [], updatedAt: j.updatedAt || '' };
  } catch (_e) {
    return { groups: [], monitor: [], pins: [], tags: normTags(null), kinds: { 'bdesk-sla': true }, sent: {}, log: [], updatedAt: '' };
  }
}
function saveNotify(cfg) {
  const now = Date.now();
  for (const [k, t] of Object.entries(cfg.sent)) if (now - t > 72 * 3600e3) delete cfg.sent[k];
  cfg.log = cfg.log.slice(-60);
  fs.writeFileSync(NOTIFY_FILE, JSON.stringify(cfg, null, 2));
}
function publicNotify(cfg) {
  return { groups: cfg.groups, monitor: cfg.monitor || [], pins: cfg.pins || [], tags: cfg.tags || normTags(null), kinds: cfg.kinds, log: cfg.log.slice(-20).reverse(), updatedAt: cfg.updatedAt };
}
async function sendToGroups(cfg, body, kind) {
  const results = [];
  for (const g of cfg.groups) {
    try { await client.sendMessage(g.id, body); results.push({ id: g.id, name: g.name, ok: true }); }
    catch (err) { results.push({ id: g.id, name: g.name, ok: false, error: err.message }); }
  }
  cfg.log.push({ at: new Date().toISOString(), kind, groups: results.length, ok: results.filter(r => r.ok).length, preview: body.slice(0, 140) });
  return results;
}

app.get('/api/groups', async (_req, res) => {
  if (!requireReady(res)) return;
  try {
    const chats = await client.getChats();
    res.json(chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name || 'Grupo sem nome', participants: (c.participants || []).length, timestamp: c.timestamp || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  } catch (err) {
    falhaDeInjecao(err); res.status(500).json({ error: err.message });
  }
});

app.get('/api/notify-config', (_req, res) => res.json(publicNotify(loadNotify())));

app.post('/api/notify-config', (req, res) => {
  const cfg = loadNotify();
  if (Array.isArray(req.body.groups)) {
    cfg.groups = req.body.groups.filter(g => g && /@g\.us$/.test(String(g.id || ''))).map(g => ({ id: String(g.id), name: String(g.name || '').slice(0, 120) })).slice(0, 20);
  }
  if (Array.isArray(req.body.monitor)) {
    cfg.monitor = req.body.monitor.filter(g => g && /@(g|c)\.us$/.test(String(g.id || ''))).map(g => ({ id: String(g.id), name: String(g.name || '').slice(0, 120) })).slice(0, 4);
  }
  if (Array.isArray(req.body.pins)) {
    cfg.pins = [...new Set(req.body.pins.map(String))].filter(id => CHAT_ID_RE.test(id)).slice(0, 30);
  }
  if (req.body.tags && typeof req.body.tags === 'object') cfg.tags = normTags(req.body.tags);
  if (req.body.kinds && typeof req.body.kinds === 'object') {
    for (const [k, v] of Object.entries(req.body.kinds)) cfg.kinds[String(k).slice(0, 40)] = !!v;
  }
  cfg.updatedAt = new Date().toISOString();
  saveNotify(cfg);
  res.json(publicNotify(cfg));
});

app.post('/api/notify-test', async (_req, res) => {
  if (!requireReady(res)) return;
  const cfg = loadNotify();
  if (!cfg.groups.length) { res.status(400).json({ error: 'Nenhum grupo principal escolhido.' }); return; }
  const body = '✅ *Jarvis* — teste de notificação.\nEste grupo foi escolhido como principal para receber os alertas do painel.';
  const results = await sendToGroups(cfg, body, 'teste');
  saveNotify(cfg);
  res.json({ ok: results.every(r => r.ok), results });
});

// Notificação com itens deduplicados por chave: { kind, title, items:[{key,text}], footer, ttlHours }
app.post('/api/notify', async (req, res) => {
  if (!requireReady(res)) return;
  const cfg = loadNotify();
  const kind = String(req.body.kind || 'geral').slice(0, 40);
  if (cfg.kinds[kind] === false) { res.json({ ok: true, skipped: 'tipo desligado' }); return; }
  if (!cfg.groups.length) { res.json({ ok: true, skipped: 'sem grupos principais' }); return; }
  const ttl = Math.max(1, Math.min(72, Number(req.body.ttlHours || 12))) * 3600e3;
  const now = Date.now();
  const items = (Array.isArray(req.body.items) ? req.body.items : []).map(i => ({ key: kind + ':' + String(i.key || i.text || ''), text: String(i.text || '').slice(0, 300) })).filter(i => i.text);
  const novos = items.filter(i => !(cfg.sent[i.key] && now - cfg.sent[i.key] < ttl));
  if (!novos.length) { res.json({ ok: true, skipped: 'já enviado' }); return; }
  const title = String(req.body.title || 'Jarvis').slice(0, 200);
  const footer = String(req.body.footer || '').slice(0, 200);
  const body = [title, ...novos.slice(0, 25).map(i => '• ' + i.text), novos.length > 25 ? '… e mais ' + (novos.length - 25) : '', footer].filter(Boolean).join('\n');
  novos.forEach(i => { cfg.sent[i.key] = now; });
  const results = await sendToGroups(cfg, body, kind);
  saveNotify(cfg);
  res.json({ ok: results.every(r => r.ok), sent: novos.length, results });
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'status', state: publicState() }));
});

server.listen(PORT, HOST, () => {
  console.log(`Jarvis WhatsApp bridge on http://${HOST}:${PORT}`);
  console.log(`WhatsApp auth dir: ${AUTH_DIR}`);
  startClient();
});

process.on('SIGINT', async () => {
  if (client) await client.destroy().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (client) await client.destroy().catch(() => {});
  process.exit(0);
});
