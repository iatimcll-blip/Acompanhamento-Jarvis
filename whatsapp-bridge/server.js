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
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: info => ehLocal(info.req) || chaveOk(info.req) });

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

// ── Acesso de outros aparelhos (2026-11-18) ───────────────────────────────────────────────
// A ponte continua ouvindo só em 127.0.0.1. Para outros aparelhos, ela abre um túnel gratuito da
// Cloudflare (cloudflared "quick tunnel", https://<aleatório>.trycloudflare.com → 127.0.0.1:8788).
// TODO acesso que chega pelo túnel precisa da CHAVE (header X-Jarvis-Key ou ?k=); o acesso local
// (este PC) segue como antes. A chave fica só neste PC (.jarvis-chave, fora do git). O painel deste
// PC publica o endereço do túnel CRIPTOGRAFADO com a chave no estado sincronizado do Jarvis.
const crypto = require('crypto');
const { spawn } = require('child_process');
const CHAVE_FILE = process.env.WPP_CHAVE_FILE || path.join(__dirname, '.jarvis-chave');
const CLOUDFLARED = process.env.WPP_CLOUDFLARED || path.join(__dirname, 'cloudflared.exe');
function lerChave() {
  try { const k = fs.readFileSync(CHAVE_FILE, 'utf8').trim(); if (k.length >= 24) return k; } catch (_e) {}
  return gerarChave();
}
function gerarChave() {
  const k = crypto.randomBytes(18).toString('base64url'); // 24 caracteres
  fs.writeFileSync(CHAVE_FILE, k);
  return k;
}
let CHAVE = lerChave();
function ehLocal(req) {
  const h = req.headers || {};
  if (h['cf-connecting-ip'] || h['cf-ray'] || h['cdn-loop']) return false;
  const host = String(h.host || '').toLowerCase();
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
  const ip = String((req.socket && req.socket.remoteAddress) || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function chaveOk(req) {
  let k = String((req.headers && req.headers['x-jarvis-key']) || '');
  if (!k) { try { k = new URL(req.url, 'http://x').searchParams.get('k') || ''; } catch (_e) {} }
  const a = Buffer.from(k), b = Buffer.from(CHAVE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const _falhas = new Map(); // ip -> { n, at } — freia tentativa de adivinhar a chave
function bloqueado(req) {
  const ip = String((req.headers && req.headers['cf-connecting-ip']) || '?');
  const f = _falhas.get(ip); return !!(f && f.n >= 20 && Date.now() - f.at < 15 * 60e3);
}
function registraFalha(req) {
  const ip = String((req.headers && req.headers['cf-connecting-ip']) || '?');
  const f = _falhas.get(ip) || { n: 0, at: 0 };
  if (Date.now() - f.at > 15 * 60e3) f.n = 0;
  f.n++; f.at = Date.now(); _falhas.set(ip, f);
}
const tunel = { url: '', status: 'desligado', erro: '', at: '' };
let tunelProc = null, tunelTentativas = 0;
function iniciarTunel() {
  if (process.env.WPP_TUNEL === '0') { tunel.status = 'desativado'; return; }
  if (!fs.existsSync(CLOUDFLARED)) { tunel.status = 'sem-cloudflared'; tunel.erro = 'cloudflared.exe não encontrado em ' + CLOUDFLARED; return; }
  tunel.status = 'iniciando'; tunel.url = ''; tunel.erro = '';
  try {
    tunelProc = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT], { windowsHide: true });
  } catch (e) { tunel.status = 'erro'; tunel.erro = e.message; agendaTunel(); return; }
  const ler = buf => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(buf));
    if (m && m[0] !== tunel.url) { tunel.url = m[0]; tunel.status = 'ativo'; tunel.at = new Date().toISOString(); tunelTentativas = 0; console.log('[tunel] ativo:', tunel.url); broadcast('status'); }
  };
  tunelProc.stdout.on('data', ler); tunelProc.stderr.on('data', ler);
  tunelProc.on('exit', code => { console.warn('[tunel] encerrado, código', code); tunelProc = null; tunel.status = 'caiu'; tunel.url = ''; agendaTunel(); });
  tunelProc.on('error', e => { tunel.status = 'erro'; tunel.erro = e.message; });
}
function agendaTunel() { tunelTentativas++; setTimeout(iniciarTunel, Math.min(300e3, 10e3 * tunelTentativas)); }
process.on('exit', () => { try { if (tunelProc) tunelProc.kill(); } catch (_e) {} });
/* 2026-11-25: o quick tunnel "morre" do lado da Cloudflare sem o cloudflared encerrar (o endereço
   *.trycloudflare.com deixa de existir — DNS não resolve) e os outros aparelhos ficavam sem WhatsApp
   até alguém reiniciar a ponte. Vigia: a cada 3 min a ponte chama o PRÓPRIO túnel em /api/vivo (rota
   pública que só devolve um código aleatório deste processo — nenhum dado) e, com 2 falhas seguidas,
   encerra o cloudflared; o 'exit' acima recria o túnel (endereço novo) e o Jarvis do PC republica. */
const VIVO = crypto.randomBytes(12).toString('hex');
let tunelFalhasVivo = 0;
async function vigiaTunel() {
  if (tunel.status !== 'ativo' || !tunel.url || !tunelProc) { tunelFalhasVivo = 0; return; }
  const url = tunel.url;
  let ok = false, motivo = '';
  try {
    const r = await fetch(url + '/api/vivo', { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    const t = await r.text();
    ok = r.ok && t.trim() === VIVO; if (!ok) motivo = 'HTTP ' + r.status;
  } catch (e) { motivo = (e && e.cause && e.cause.code) || (e && e.message) || 'erro'; }
  if (url !== tunel.url) return; /* túnel trocou enquanto testava */
  if (ok) { if (tunelFalhasVivo) console.log('[tunel] voltou a responder'); tunelFalhasVivo = 0; tunel.erro = ''; return; }
  tunelFalhasVivo++;
  tunel.erro = 'túnel sem resposta (' + motivo + ')';
  console.warn('[tunel] sem resposta pelo endereço público (' + motivo + ') — falha ' + tunelFalhasVivo + '/2');
  if (tunelFalhasVivo >= 2) {
    tunelFalhasVivo = 0;
    console.warn('[tunel] recriando o túnel (endereço novo)');
    try { tunelProc.kill(); } catch (_e) {}
  }
}
setInterval(() => { vigiaTunel().catch(() => {}); }, 3 * 60e3);
setTimeout(() => { vigiaTunel().catch(() => {}); }, 45e3);
// Rota pública do vigia do túnel: só um código aleatório deste processo, sem nenhum dado
app.get('/api/vivo', (_req, res) => { res.set('Cache-Control', 'no-store'); res.type('text/plain').send(VIVO); });
// Porteiro: acesso pelo túnel só com a chave
app.use((req, res, next) => {
  if (ehLocal(req)) return next();
  if (req.method === 'OPTIONS') return next();
  if (bloqueado(req)) { res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }); return; }
  if (!chaveOk(req)) { registraFalha(req); res.status(401).json({ error: 'Chave de acesso inválida.' }); return; }
  if (/^\/api\/(tunel|restart)/.test(req.path)) { res.status(403).json({ error: 'Disponível só no PC da ponte.' }); return; }
  next();
});
// Só no PC da ponte: endereço do túnel + chave (para o painel publicar criptografado) e troca de chave
app.get('/api/tunel', (_req, res) => { res.json({ ...tunel, chave: CHAVE }); });
app.post('/api/tunel/nova-chave', (_req, res) => { CHAVE = gerarChave(); _falhas.clear(); res.json({ ...tunel, chave: CHAVE }); });

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

/* 2026-11-25: histórico local das mensagens (só neste PC, fora do git).
   Com o WhatsApp Web fixado numa versão anterior, depois de cada reinício da ponte a conversa volta com 0
   mensagens na memória e loadEarlierMsgs não traz nada — o painel (e o bloco Massivos/Bdesk / Resumo do dia)
   perdia tudo o que tinha chegado antes. Agora toda mensagem recebida/enviada/lida fica guardada aqui por 72 h
   (até 400 por conversa) e /api/chats/:id/messages completa com ela. */
const HIST_FILE = path.join(__dirname, '.historico.json');
const HIST_HORAS = 72, HIST_MAX = 400;
let hist = {};
try { hist = JSON.parse(fs.readFileSync(HIST_FILE, 'utf8')) || {}; } catch (_) { hist = {}; }
let _histTimer = null;
function histSalvar() {
  if (_histTimer) return;
  _histTimer = setTimeout(() => {
    _histTimer = null;
    const lim = Date.now() / 1000 - HIST_HORAS * 3600;
    for (const id of Object.keys(hist)) {
      hist[id] = (hist[id] || []).filter(m => m && m.timestamp >= lim).slice(-HIST_MAX);
      if (!hist[id].length) delete hist[id];
    }
    fs.writeFile(HIST_FILE + '.tmp', JSON.stringify(hist), err => { if (!err) fs.rename(HIST_FILE + '.tmp', HIST_FILE, () => {}); });
  }, 15000);
}
function histGuardar(chatId, lista) {
  if (!chatId || !lista || !lista.length) return;
  const arr = hist[chatId] || (hist[chatId] = []);
  const idx = new Map(arr.map((m, i) => [m.id, i]));
  let mudou = false;
  for (const m of lista) {
    if (!m || !m.id || !m.timestamp) continue;
    const i = idx.get(m.id);
    if (i === undefined) { idx.set(m.id, arr.length); arr.push(m); mudou = true; }
    else if (JSON.stringify(arr[i]) !== JSON.stringify(m)) { arr[i] = m; mudou = true; }
  }
  if (mudou) { arr.sort((a, b) => a.timestamp - b.timestamp); if (arr.length > HIST_MAX) arr.splice(0, arr.length - HIST_MAX); histSalvar(); }
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

// Chrome "órfão" (2026-11-18): se o navegador antigo trava ao fechar, ele segura a pasta da sessão e
// toda tentativa nova falha com "The browser is already running for ...". Antes de abrir, encerra SÓ os
// processos de Chrome cujo comando aponta para a pasta de sessão da ponte (nunca o Chrome do usuário)
// e apaga as travas de perfil que sobraram.
function liberarPerfil() {
  return new Promise(resolve => {
    const dir = path.join(AUTH_DIR, 'session-' + CLIENT_ID);
    const fim = () => {
      for (const n of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
        try { fs.rmSync(path.join(dir, n), { force: true }); } catch (_) {}
      }
      resolve();
    };
    if (process.platform !== 'win32') { fim(); return; }
    const alvo = dir.replace(/'/g, "''");
    const ps = "$a='" + alvo + "'; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($a, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }";
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, timeout: 20000 }, (_e, out) => {
        const n = String(out || '').trim().split(/\s+/).filter(Boolean).length;
        if (n) console.log('[perfil] ' + n + ' processo(s) de Chrome órfão(s) encerrado(s)');
        setTimeout(fim, n ? 1500 : 0);
      });
  });
}

async function startClient() {
  if (initializing) return;
  initializing = true;
  setStatus('starting', { lastError: '' });
  await liberarPerfil();

  client = new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: AUTH_DIR }),
    // 2026-11-24 (autorizado pelo usuário): WhatsApp Web atual não casa com a versão embutida da biblioteca; fixa versão compatível do repositório wa-version (terceiros)
    webVersion: '2.3000.1055837054-alpha',
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html', strict: false },
    authTimeoutMs: 120000, // Chrome lento aqui: o padrão de 30 s estourava "Waiting failed" (2026-11-23)
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
    const sm = await summarizeMessage(message);
    try { histGuardar(message.from, [sm]); } catch (_) {}
    broadcast('message', { message: sm });
  });
  client.on('message_ack', (message, ack) => {
    broadcast('ack', { id: message.id && message.id._serialized, ack });
  });
  client.on('message_create', async message => {
    if (!message.fromMe) return;
    touch();
    const sm = await summarizeMessage(message);
    try { histGuardar(message.to, [sm]); } catch (_) {}
    broadcast('message_create', { message: sm });
  });

  try {
    await client.initialize();
  } catch (err) {
    setStatus('error', { lastError: err.message || String(err) });
    scheduleRestart(/already running/i.test(String(err && err.message)) ? 3000 : 15000); // ex.: 'Requesting main frame too early!' — tenta de novo sozinho
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
    let proc = null;
    try { proc = oldClient.pupBrowser && oldClient.pupBrowser.process(); } catch (_) {}
    // destroy() pode ficar pendurado com o frame "detached": no máximo 10 s
    await Promise.race([oldClient.destroy().catch(() => {}), new Promise(r => setTimeout(r, 10000))]);
    try { if (proc && proc.exitCode === null) proc.kill('SIGKILL'); } catch (_) {}
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
// Vigia (2026-11-23): às vezes o whatsapp-web.js autentica e nunca dispara 'ready' — a ponte ficava
// presa em 'authenticated' para sempre. Se ficar mais de 2 min em starting/authenticated, reinicia sozinha.
let _vigDesde = Date.now(), _vigStatus = '', _vigTentativas = 0;
setInterval(() => {
  const st = state.status;
  if (st !== _vigStatus) { _vigStatus = st; _vigDesde = Date.now(); if (st === 'ready') _vigTentativas = 0; return; }
  if (st !== 'authenticated' && st !== 'starting' && st !== 'error' && st !== 'disconnected') return;
  const limite = (_vigTentativas < 3 ? 300 : 900) * 1000;
  if (Date.now() - _vigDesde < limite || restartTimer) return;
  _vigTentativas++; _vigDesde = Date.now();
  console.error('[vigia] preso em "' + st + '" — reiniciando cliente (tentativa ' + _vigTentativas + ')');
  scheduleRestart(1000);
}, 15000);
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
    const vivas = await Promise.all(messages.map(summarizeMessage));
    histGuardar(req.params.id, vivas);
    /* completa com o histórico local (mensagens que a memória do WhatsApp Web perdeu num reinício) */
    const porId = new Map((hist[req.params.id] || []).map(m => [m.id, m]));
    vivas.forEach(m => porId.set(m.id, m));
    res.json([...porId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit));
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
// Mídia das mensagens: imagem/figurinha (miniatura), ÁUDIO e mensagem de voz (tocar no painel, 2026-11-18),
// vídeo (assistir) e documento (?dl=1 baixa com o nome original). Suporta Range, para o player poder avançar/voltar.
const MEDIA_TIPOS = ['image', 'sticker', 'audio', 'ptt', 'video', 'document'];
/* 2026-11-25: "Abrir" qualquer arquivo. Só formatos que o navegador mostra SEM executar código abrem na
   aba (PDF, imagem, vídeo, áudio, texto); o resto (Word, Excel, ZIP, HTML, SVG…) sai como download com o
   nome original — um arquivo recebido nunca roda script na origem da ponte. nosniff impede o navegador
   de "adivinhar" outro tipo. */
const MEDIA_INLINE = /^(image\/(png|jpe?g|gif|webp|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|text\/plain)$/i;
function enviaMidia(req, res, c) {
  const inline = !req.query.dl && MEDIA_INLINE.test(c.type);
  res.set('Content-Type', inline ? c.type : (c.type === 'text/html' || /svg|xml|javascript/i.test(c.type) ? 'application/octet-stream' : c.type))
    .set('Cache-Control', 'private, max-age=86400').set('Accept-Ranges', 'bytes').set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(c.nome || 'arquivo'));
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    const total = c.buf.length;
    let ini = m[1] ? Number(m[1]) : total - Number(m[2]), fim = m[1] && m[2] ? Number(m[2]) : total - 1;
    if (ini < 0) ini = 0; if (fim >= total) fim = total - 1;
    if (ini > fim) { res.status(416).set('Content-Range', 'bytes */' + total).end(); return; }
    res.status(206).set('Content-Range', 'bytes ' + ini + '-' + fim + '/' + total).send(c.buf.subarray(ini, fim + 1));
    return;
  }
  res.send(c.buf);
}
const mediaBaixando = new Map();
/* 2026-11-25: com o WhatsApp Web fixado numa versão anterior, o msg.downloadMedia() da biblioteca trava
   para imagem e documento (só áudio funcionava) e o pedido ficava pendurado para sempre — e o mesmo
   arquivo travava de novo a cada clique. Agora: caminho normal com limite de 20 s; se não vier, o caminho
   direto (WAWebDownloadManager.downloadAndMaybeDecrypt, o mesmo das versões antigas da biblioteca),
   com limite de 60 s. Sem resposta = 404 ("indisponível"), nunca pendurado. */
const comPrazo = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('__prazo__'), ms))]);
/* 2026-11-25 (2): causa real do "imagem/documento não abre": o WhatsApp Web fixado baixa o arquivo, mas a
   validação interna dele recusa ("Unexpected mimetype application/octet-stream for media type image") e o
   download fica preso em DECRYPTING. Solução: a ponte baixa o arquivo CIFRADO do servidor de mídia do WhatsApp
   (directPath da mensagem) e decifra aqui mesmo com a mediaKey da mensagem — procedimento padrão do WhatsApp:
   HKDF-SHA256(mediaKey, 112 bytes, "WhatsApp <Tipo> Keys") → iv | chave AES-256-CBC | chave HMAC; confere o MAC. */
const HKDF_INFO = { image: 'WhatsApp Image Keys', sticker: 'WhatsApp Image Keys', video: 'WhatsApp Video Keys', gif: 'WhatsApp Video Keys', audio: 'WhatsApp Audio Keys', ptt: 'WhatsApp Audio Keys', document: 'WhatsApp Document Keys' };
async function baixarCifrado(id) {
  const meta = await client.pupPage.evaluate(async (msgId) => {
    const { Msg } = window.require('WAWebCollections');
    const msg = Msg.get(msgId) || (await Msg.getMessagesById([msgId]))?.messages?.[0];
    if (!msg || !msg.directPath || !msg.mediaKey) return null;
    return { directPath: msg.directPath, mediaKey: msg.mediaKey, type: msg.type, mimetype: msg.mimetype, filename: msg.filename, url: msg.deprecatedMms3Url || msg.clientUrl || '' };
  }, id);
  if (!meta) return null;
  const info = HKDF_INFO[meta.type];
  if (!info) return null;
  const urls = [meta.url, 'https://mmg.whatsapp.net' + meta.directPath].filter((u, i, a) => u && /^https:\/\/[\w.-]+\.whatsapp\.net\//.test(u) && a.indexOf(u) === i);
  let enc = null, ultimoErro = '';
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) { ultimoErro = 'HTTP ' + r.status; continue; }
      enc = Buffer.from(await r.arrayBuffer()); break;
    } catch (e) { ultimoErro = e.message; }
  }
  if (!enc || enc.length <= 10) throw new Error('download cifrado falhou: ' + ultimoErro);
  const chaves = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(meta.mediaKey, 'base64'), Buffer.alloc(32), Buffer.from(info), 112));
  const iv = chaves.subarray(0, 16), chaveAes = chaves.subarray(16, 48), chaveMac = chaves.subarray(48, 80);
  const corpo = enc.subarray(0, enc.length - 10), mac = enc.subarray(enc.length - 10);
  const conferido = crypto.createHmac('sha256', chaveMac).update(iv).update(corpo).digest().subarray(0, 10);
  if (!crypto.timingSafeEqual(conferido, mac)) throw new Error('MAC da mídia não confere');
  const d = crypto.createDecipheriv('aes-256-cbc', chaveAes, iv);
  const buf = Buffer.concat([d.update(corpo), d.final()]);
  return { data: buf.toString('base64'), mimetype: meta.mimetype, filename: meta.filename };
}
app.get('/api/media/:id', async (req, res) => {
  const id = String(req.params.id || '');
  const c = mediaCache.get(id);
  if (c) { enviaMidia(req, res, c); return; }
  if (!client || state.status !== 'ready') { res.status(404).end(); return; }
  try {
    // o player pede o mesmo arquivo várias vezes (Range): um download só
    if (!mediaBaixando.has(id)) mediaBaixando.set(id, (async () => {
      const msg = await client.getMessageById(id);
      if (!msg || !msg.hasMedia || !MEDIA_TIPOS.includes(msg.type)) return null;
      let media = await comPrazo(baixarCifrado(id).catch(e => { console.warn('[midia] decifragem local falhou:', e && e.message); return null; }), 30000);
      if (media === '__prazo__' || !media || !media.data) {
        media = await comPrazo(msg.downloadMedia().catch(() => null), 20000);
        if (media === '__prazo__') { console.warn('[midia] sem resposta em 50 s:', id.slice(-12)); media = null; }
      }
      if (!media || !media.data) return null;
      const buf = Buffer.from(media.data, 'base64');
      const tipo = String(media.mimetype || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
      const item = { buf, type: tipo, nome: media.filename || msg.filename || ('arquivo-' + id.slice(-6)), at: Date.now() };
      if (buf.length <= 40 * 1024 * 1024) {
        if (mediaCache.size > 300) mediaCache.delete(mediaCache.keys().next().value);
        mediaCache.set(id, item);
      }
      return item;
    })().finally(() => setTimeout(() => mediaBaixando.delete(id), 1000)));
    const item = await mediaBaixando.get(id);
    if (!item) { res.status(404).end(); return; }
    if (item.buf.length > 64 * 1024 * 1024) { res.status(413).end(); return; }
    enviaMidia(req, res, item);
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
  if (!NOTIFY_AUTOMATICO) { res.json({ ok: true, skipped: 'envio automático desativado' }); return; } // regra: só envio manual com destino escolhido
  if (!requireReady(res)) return;
  const cfg = loadNotify();
  if (!cfg.groups.length) { res.status(400).json({ error: 'Nenhum grupo principal escolhido.' }); return; }
  const body = '✅ *Jarvis* — teste de notificação.\nEste grupo foi escolhido como principal para receber os alertas do painel.';
  const results = await sendToGroups(cfg, body, 'teste');
  saveNotify(cfg);
  res.json({ ok: results.every(r => r.ok), results });
});

// Notificação com itens deduplicados por chave: { kind, title, items:[{key,text}], footer, ttlHours }
// Envio AUTOMÁTICO de painel para os grupos: DESATIVADO a pedido do usuário (2026-11-18).
// Bloqueado aqui na ponte para que nenhuma aba antiga (em qualquer aparelho) dispare mensagens sozinha.
// Mensagens só saem por ação manual (/api/send-message, /api/forward, /api/notify-test).
const NOTIFY_AUTOMATICO = false;
app.post('/api/notify', async (req, res) => {
  if (!NOTIFY_AUTOMATICO) { res.json({ ok: true, skipped: 'envio automático desativado' }); return; }
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
  iniciarTunel();
});

process.on('SIGINT', async () => {
  if (client) await client.destroy().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (client) await client.destroy().catch(() => {});
  process.exit(0);
});
