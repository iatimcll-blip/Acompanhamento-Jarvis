const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const { Client, LocalAuth } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || process.env.WPP_PORT || 8788);
const CORS_ORIGIN = process.env.WPP_CORS_ORIGIN || '*';
const CLIENT_ID = process.env.WPP_CLIENT_ID || 'jarvis';
const AUTH_DIR = process.env.WPP_AUTH_DIR || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, '.wwebjs_auth') : path.join(__dirname, '.wwebjs_auth'));

fs.mkdirSync(AUTH_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '1mb' }));

let client;
let initializing = false;
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

function summarizeMessage(message) {
  return {
    id: message.id && message.id._serialized,
    from: message.from,
    to: message.to,
    author: message.author || '',
    body: message.body || '',
    fromMe: !!message.fromMe,
    timestamp: message.timestamp || 0,
    type: message.type || 'chat',
    hasMedia: !!message.hasMedia
  };
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
        '--disable-software-rasterizer',
        '--single-process'
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
  client.on('auth_failure', msg => setStatus('auth_failure', { lastError: String(msg || 'Falha de autenticação') }));
  client.on('disconnected', reason => setStatus('disconnected', { lastError: String(reason || 'Sessão desconectada') }));
  client.on('message', message => {
    state.unread += 1;
    touch();
    broadcast('message', { message: summarizeMessage(message) });
  });
  client.on('message_create', message => {
    touch();
    broadcast('message_create', { message: summarizeMessage(message) });
  });

  try {
    await client.initialize();
  } catch (err) {
    setStatus('error', { lastError: err.message || String(err) });
  } finally {
    initializing = false;
  }
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'jarvis-whatsapp-bridge', docs: ['/health', '/api/status', '/api/chats'] }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'jarvis-whatsapp-bridge', authDir: AUTH_DIR, state: publicState() }));
app.get('/api/status', (_req, res) => res.json(publicState()));

app.post('/api/restart', async (_req, res) => {
  try {
    if (client) await client.destroy().catch(() => {});
    await startClient();
    res.json(publicState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', async (_req, res) => {
  try {
    if (client) await client.logout();
    setStatus('disconnected', { me: null, qr: '', qrText: '' });
    res.json(publicState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats', async (_req, res) => {
  if (!requireReady(res)) return;
  try {
    const chats = await client.getChats();
    res.json(chats.map(summarizeChat).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/:id/messages', async (req, res) => {
  if (!requireReady(res)) return;
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const chat = await client.getChatById(req.params.id);
    const messages = await chat.fetchMessages({ limit });
    res.json(messages.map(summarizeMessage));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const msg = await client.sendMessage(to, body);
    res.json({ ok: true, message: summarizeMessage(msg) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'status', state: publicState() }));
});

server.listen(PORT, () => {
  console.log(`Jarvis WhatsApp bridge on http://localhost:${PORT}`);
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
