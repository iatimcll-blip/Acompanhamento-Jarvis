/* Jarvis · WhatsApp deste aparelho — adaptador (roda DENTRO da aba do WhatsApp Web, no mundo da página).
   Usa a biblioteca wa-js (window.WPP, arquivo wppconnect-wa.js) e responde, com o MESMO formato da ponte do PC,
   as chamadas que o painel faz (/api/status, /api/chats, /api/chats/:id/messages ...). Quem fala com o painel é
   o painel-shim.js; o caminho é painel → ponte da extensão → serviço de fundo → wa-relay.js → este arquivo. */
(function () {
  if (window.__jarvisWaAdaptador) return;
  window.__jarvisWaAdaptador = true;
  const ORIGEM = location.origin;
  const INICIO = new Date().toISOString();
  const TIPOS_MIDIA = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'];
  const contatos = new Map();
  const nomeChat = new Map();
  let naoLidas = 0;

  const sid = x => (x == null ? '' : (typeof x === 'string' ? x : (x._serialized || (x.toString && x.toString()) || '')));
  const W = () => window.WPP;
  const pronto = () => { try { return !!(W() && W().isReady && W().conn.isAuthenticated() && W().conn.isMainReady()); } catch (_) { return false; } };

  /* ── status ── */
  function qrDaPagina() {
    try {
      const cv = [...document.querySelectorAll('canvas')].find(c => c.width >= 100 && c.offsetParent !== null);
      return cv ? cv.toDataURL('image/png') : '';
    } catch (_) { return ''; }
  }
  function estado() {
    const base = { qr: '', qrText: '', hasQr: false, me: null, lastError: '', unread: naoLidas, startedAt: INICIO, updatedAt: new Date().toISOString(), instancia: 'Este aparelho (extensão)' };
    if (!W() || !W().isInjected) return Object.assign(base, { status: 'starting' });
    if (pronto()) {
      let wid = '', nome = '';
      try { wid = sid(W().conn.getMyUserId()); } catch (_) {}
      try { nome = (W().whatsapp.Conn && W().whatsapp.Conn.pushname) || ''; } catch (_) {}
      return Object.assign(base, { status: 'ready', me: { wid, pushname: nome, platform: 'extensão' } });
    }
    const qr = qrDaPagina();
    if (qr) return Object.assign(base, { status: 'qr', qr, hasQr: true, lastError: 'Leia o QR Code com o WhatsApp do seu celular (WhatsApp › Aparelhos conectados).' });
    return Object.assign(base, { status: 'starting' });
  }

  /* ── contatos e resumos no mesmo formato da ponte ── */
  async function contato(id) {
    const k = String(id || '').trim();
    if (!k) return { id: k, name: '', number: '' };
    if (contatos.has(k)) return contatos.get(k);
    let item = { id: k, name: k.replace(/@.+$/, ''), number: k.replace(/@.+$/, '') };
    try {
      const c = await W().contact.get(k);
      if (c) item = { id: k, name: c.name || c.pushname || c.shortName || c.formattedName || item.number, number: (c.id && c.id.user) || item.number };
    } catch (_) {}
    contatos.set(k, item);
    return item;
  }
  function ultimaMsgDoChat(c) {
    try {
      const arr = (c.msgs && (c.msgs.getModelsArray ? c.msgs.getModelsArray() : c.msgs.models)) || [];
      return arr.length ? arr[arr.length - 1] : null;
    } catch (_) { return null; }
  }
  function resumoChat(c) {
    const id = sid(c.id);
    const nome = c.name || c.formattedTitle || (c.contact && (c.contact.name || c.contact.pushname)) || (c.id && c.id.user) || 'Sem nome';
    if (id && nome) nomeChat.set(id, nome);
    const m = ultimaMsgDoChat(c);
    const ehMidia = m && TIPOS_MIDIA.includes(m.type);
    return {
      id, name: nome, isGroup: !!c.isGroup, unreadCount: c.unreadCount || 0, timestamp: c.t || 0,
      archived: !!c.archive, pinned: !!c.pin,
      lastMessage: m ? { body: (ehMidia ? (m.caption || '') : (m.body || '')) || '', fromMe: !!(m.id && m.id.fromMe), timestamp: m.t || 0 } : null
    };
  }
  async function resumoMsg(m, comCitacao = true) {
    const id = sid(m.id);
    const fromMe = !!(m.id && m.id.fromMe);
    const from = sid(m.from), to = sid(m.to), author = sid(m.author);
    const senderId = author || (fromMe ? to : from) || '';
    const s = await contato(senderId);
    const hasMedia = !!(m.mediaKey || m.directPath || m.clientUrl || (TIPOS_MIDIA.includes(m.type) && m.type !== 'chat'));
    let quoted = null;
    if (comCitacao && (m.quotedStanzaID || m.quotedMsg)) {
      try {
        const q = m.quotedMsg || {};
        const qFrom = sid(q.author) || (q.id && q.id.fromMe ? sid(m.to) : sid(q.from)) || sid(m.quotedParticipant);
        const qc = qFrom ? await contato(qFrom) : { name: '' };
        quoted = { id: sid(q.id) || m.quotedStanzaID || '', body: String(q.body || '').slice(0, 300), type: q.type || 'chat', fromMe: !!(q.id && q.id.fromMe), senderName: (q.id && q.id.fromMe) ? 'Você' : (qc.name || '') };
      } catch (_) {}
    }
    return {
      ack: typeof m.ack === 'number' ? m.ack : null, quoted, isForwarded: !!m.isForwarded, filename: m.filename || '',
      id, from, to, author, senderId, senderName: s.name || '', senderNumber: s.number || '',
      body: (hasMedia ? (m.caption || '') : (m.body || '')) || '', fromMe, timestamp: m.t || 0, type: m.type || 'chat', hasMedia
    };
  }

  /* ── utilitários ── */
  function blobParaB64(blob) {
    return new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => err(r.error); r.readAsDataURL(blob); });
  }
  const json = (status, dados) => ({ status, tipo: 'json', json: dados });
  const erro = (status, msg) => json(status, { error: msg });
  const naoPronto = () => json(409, { error: 'WhatsApp ainda não conectado. Leia o QR Code primeiro.', state: estado() });
  function idsOk(id) { return /^[\w.-]+@(c|g)\.us$|^[\w.-]+@lid$/.test(String(id || '')); }

  /* ── roteador: mesmas rotas da ponte do PC ── */
  async function tratar(p) {
    const u = new URL(p.caminho, 'https://x');
    const rota = u.pathname, q = u.searchParams, metodo = String(p.metodo || 'GET').toUpperCase();
    let corpo = {};
    if (p.corpo) { try { corpo = JSON.parse(p.corpo) || {}; } catch (_) { corpo = {}; } }

    if (rota === '/api/status' || rota === '/health') return json(200, estado());
    if (rota === '/api/restart') { setTimeout(() => location.reload(), 300); return json(200, estado()); }
    if (rota === '/api/logout') { try { await W().conn.logout(); } catch (_) {} return json(200, estado()); }
    if (!pronto()) { if (rota.startsWith('/api/media/') || rota.startsWith('/api/avatar/')) return { status: 404, tipo: 'vazio' }; return naoPronto(); }

    if (rota === '/api/chats' && metodo === 'GET') {
      const chats = await W().chat.list({ count: 100 });
      return json(200, chats.map(resumoChat).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100));
    }
    let m;
    if ((m = rota.match(/^\/api\/chats\/([^/]+)\/messages$/)) && metodo === 'GET') {
      const id = decodeURIComponent(m[1]);
      const limite = Math.max(1, Math.min(300, Number(q.get('limit') || 50)));
      const msgs = await W().chat.getMessages(id, { count: limite });
      const vivas = await Promise.all(msgs.map(x => resumoMsg(x)));
      return json(200, vivas.sort((a, b) => a.timestamp - b.timestamp).slice(-limite));
    }
    if ((m = rota.match(/^\/api\/chats\/([^/]+)\/seen$/)) && metodo === 'POST') {
      await W().chat.markIsRead(decodeURIComponent(m[1]));
      return json(200, { ok: true });
    }
    if (rota === '/api/send-message' && metodo === 'POST') {
      const to = String(corpo.to || '').trim(), body = String(corpo.body || '').trim();
      if (!to || !body) return erro(400, 'Informe to e body.');
      const opts = {};
      if (corpo.quotedMessageId) opts.quotedMsg = String(corpo.quotedMessageId);
      const r = await W().chat.sendTextMessage(to, body, opts);
      const msg = r && r.id ? (await W().chat.getMessageById(r.id).catch(() => null)) : null;
      return json(200, { ok: true, message: msg ? await resumoMsg(msg) : { id: String(r && r.id || ''), body, fromMe: true, timestamp: Math.floor(Date.now() / 1000), type: 'chat', to, from: '', author: '', senderId: to, senderName: '', senderNumber: '', hasMedia: false, ack: null, quoted: null, isForwarded: false, filename: '' } });
    }
    if (rota === '/api/send-media' && metodo === 'POST') {
      const to = String(corpo.to || '').trim(), data = String(corpo.data || '');
      const mimetype = String(corpo.mimetype || 'application/octet-stream').slice(0, 120);
      const filename = String(corpo.filename || 'arquivo').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 160);
      if (!to || !data) return erro(400, 'Informe to e data.');
      const tamanho = Math.floor(data.length * 3 / 4);
      const ehImg = /^image\/(jpeg|png|webp)$/i.test(mimetype), ehVid = /^video\/mp4$/i.test(mimetype);
      const comoDoc = !!corpo.asDocument || (!ehImg && !(ehVid && tamanho <= 16 * 1024 * 1024));
      const opts = { type: comoDoc ? 'document' : 'auto-detect', filename, mimetype };
      if (String(corpo.caption || '').trim()) opts.caption = String(corpo.caption).trim();
      if (corpo.quotedMessageId) opts.quotedMsg = String(corpo.quotedMessageId);
      const r = await W().chat.sendFileMessage(to, 'data:' + mimetype + ';base64,' + data, opts);
      const msg = r && r.id ? (await W().chat.getMessageById(r.id).catch(() => null)) : null;
      return json(200, { ok: true, message: msg ? await resumoMsg(msg) : null });
    }
    if (rota === '/api/forward' && metodo === 'POST') {
      const messageId = String(corpo.messageId || '').trim();
      const destinos = (Array.isArray(corpo.to) ? corpo.to : [corpo.to]).map(x => String(x || '').trim()).filter(x => /@(c|g)\.us$/.test(x)).slice(0, 20);
      if (!messageId || !destinos.length) return erro(400, 'Informe messageId e to.');
      const results = [];
      for (const to of destinos) {
        try { await W().chat.forwardMessages(to, [messageId]); results.push({ to, ok: true }); }
        catch (e) { results.push({ to, ok: false, error: (e && e.message) || String(e) }); }
      }
      return json(200, { ok: results.every(r => r.ok), results });
    }
    if ((m = rota.match(/^\/api\/media\/(.+)$/)) && metodo === 'GET') {
      const id = decodeURIComponent(m[1]);
      let nome = '';
      try { const msg = await W().chat.getMessageById(id); nome = (msg && msg.filename) || ''; } catch (_) {}
      const blob = await W().chat.downloadMedia(id);
      if (!blob) return { status: 404, tipo: 'vazio' };
      return { status: 200, tipo: 'bin', mime: blob.type || 'application/octet-stream', nome, b64: await blobParaB64(blob) };
    }
    if ((m = rota.match(/^\/api\/avatar\/(.+)$/)) && metodo === 'GET') {
      const id = decodeURIComponent(m[1]);
      if (!idsOk(id)) return { status: 400, tipo: 'vazio' };
      const url = await W().contact.getProfilePictureUrl(id).catch(() => null);
      return url ? { status: 200, tipo: 'url', url } : { status: 404, tipo: 'vazio' };
    }
    if (rota === '/api/groups' && metodo === 'GET') {
      const chats = await W().chat.list({ onlyGroups: true });
      return json(200, chats.map(c => ({ id: sid(c.id), name: c.name || c.formattedTitle || 'Grupo sem nome', participants: ((c.groupMetadata && c.groupMetadata.participants && (c.groupMetadata.participants.length || (c.groupMetadata.participants.getModelsArray && c.groupMetadata.participants.getModelsArray().length))) || 0), timestamp: c.t || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    }
    if (rota === '/api/search' && metodo === 'GET') {
      const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const termos = norm(String(q.get('q') || '').trim().slice(0, 100)).split(/\s+/).filter(Boolean);
      const limite = Math.max(1, Math.min(100, Number(q.get('limit') || 60)));
      if (!termos.length) return json(200, { q: '', resultados: [] });
      const todas = (W().whatsapp.MsgStore.getModelsArray ? W().whatsapp.MsgStore.getModelsArray() : (W().whatsapp.MsgStore.models || []));
      const corte = Math.floor(Date.now() / 1000) - 72 * 3600;
      const achadas = [];
      for (const x of todas) {
        if ((x.t || 0) < corte) continue;
        const txt = norm((TIPOS_MIDIA.includes(x.type) ? x.caption : x.body) || x.filename || '');
        if (txt && termos.every(t => txt.includes(t))) achadas.push(x);
      }
      achadas.sort((a, b) => (b.t || 0) - (a.t || 0));
      const res = [];
      for (const x of achadas.slice(0, limite)) {
        const r = await resumoMsg(x, false);
        const chatId = sid(x.id && x.id.remote) || (r.fromMe ? r.to : r.from);
        res.push(Object.assign(r, { chatId, chatName: nomeChat.get(chatId) || '' }));
      }
      return json(200, { q: termos.join(' '), resultados: res });
    }
    return erro(404, 'Rota não disponível na extensão: ' + rota);
  }

  /* ── comunicação com o wa-relay.js ── */
  const responder = (id, r) => window.postMessage({ jarvisWaResposta: true, id, r }, ORIGEM);
  window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== ORIGEM) return;
    const d = ev.data;
    if (!d || d.jarvisWaPedido !== true) return;
    tratar(d).then(r => responder(d.id, r)).catch(e => responder(d.id, { status: 500, tipo: 'json', json: { error: (e && e.message) || String(e) } }));
  });
  const evento = (tipo, extra) => window.postMessage({ jarvisWaEvento: true, evento: Object.assign({ type: tipo, state: estado() }, extra || {}) }, ORIGEM);

  /* ── eventos em tempo real (mensagens, confirmações, conexão) ── */
  function ligarEventos() {
    const w = W();
    if (!w || !w.on || window.__jarvisWaEventos) return;
    window.__jarvisWaEventos = true;
    w.on('chat.new_message', async msg => {
      try {
        const fromMe = !!(msg.id && msg.id.fromMe);
        if (!fromMe) naoLidas++;
        evento(fromMe ? 'message_create' : 'message', { message: await resumoMsg(msg) });
      } catch (_) {}
    });
    w.on('chat.msg_ack_change', d => { try { evento('ack', { id: sid(d && (d.id || d.msg && d.msg.id)), ack: d && typeof d.ack === 'number' ? d.ack : null }); } catch (_) {} });
    for (const n of ['conn.authenticated', 'conn.logout', 'conn.main_ready', 'conn.require_auth', 'conn.online']) { try { w.on(n, () => evento('status')); } catch (_) {} }
  }
  let tentativas = 0;
  const espera = setInterval(() => {
    tentativas++;
    if (W() && W().isReady) { clearInterval(espera); ligarEventos(); evento('status'); }
    else if (tentativas > 600) clearInterval(espera);
  }, 1000);
  setInterval(() => evento('status'), 30000); // o painel acompanha QR/conexão mesmo sem mensagens
})();
