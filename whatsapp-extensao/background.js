/* Serviço de fundo da extensão "Jarvis · WhatsApp deste aparelho".
   - recebe os pedidos do painel (ponte do painel) e os entrega à aba do WhatsApp Web DESTE navegador;
   - abre essa aba sozinho (fixada, em segundo plano) e a traz para a frente uma vez, quando precisa do QR;
   - guarda neste aparelho a configuração do painel (grupos, fixadas, tags): o que a ponte do PC guardava em arquivo;
   - difunde os eventos em tempo real para as abas do painel. */
const URL_WA = 'https://web.whatsapp.com/*';
const URL_PAINEL = 'https://iatimcll-blip.github.io/Acompanhamento-Jarvis/*';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHAT_ID_RE = /^[\w.-]+@(c|g)\.us$|^[\w.-]+@lid$/;

async function abaWA(criar) {
  const abas = await chrome.tabs.query({ url: URL_WA });
  if (abas.length) { try { chrome.tabs.update(abas[0].id, { autoDiscardable: false }); } catch (_) {} return abas[0]; }
  if (!criar) return null;
  const t = await chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: false, pinned: true });
  try { chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (_) {}
  return t;
}
async function trazerParaFrente(tab) {
  try {
    const { jarvisWaFrente } = await chrome.storage.session.get('jarvisWaFrente');
    if (jarvisWaFrente) return;
    await chrome.storage.session.set({ jarvisWaFrente: true });
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (_) {}
}

/* configuração do painel (grupos principais, conversas fixadas, tags): guardada neste aparelho */
function normTags(t) {
  t = t && typeof t === 'object' ? t : {};
  const defs = (Array.isArray(t.defs) ? t.defs : []).filter(d => d && d.id && d.nome).map(d => ({
    id: String(d.id).replace(/[^\w-]/g, '').slice(0, 24), nome: String(d.nome).slice(0, 40),
    cor: /^#[0-9a-f]{6}$/i.test(String(d.cor || '')) ? String(d.cor) : '#64748b'
  })).filter(d => d.id).slice(0, 40);
  const ids = new Set(defs.map(d => d.id)), map = {};
  for (const [chat, lista] of Object.entries(t.map && typeof t.map === 'object' ? t.map : {})) {
    if (!CHAT_ID_RE.test(chat) || !Array.isArray(lista)) continue;
    const l = [...new Set(lista.map(String))].filter(x => ids.has(x)).slice(0, 10);
    if (l.length) map[chat] = l;
  }
  return { defs, map };
}
async function lerCfg() {
  const { jarvisWaCfg } = await chrome.storage.local.get('jarvisWaCfg');
  const j = jarvisWaCfg || {};
  return { groups: Array.isArray(j.groups) ? j.groups : [], monitor: Array.isArray(j.monitor) ? j.monitor : [], pins: Array.isArray(j.pins) ? j.pins : [], tags: normTags(j.tags), kinds: j.kinds || { 'bdesk-sla': true }, log: [], updatedAt: j.updatedAt || '' };
}
async function tratarCfg(metodo, corpo) {
  if (metodo !== 'POST') return { status: 200, tipo: 'json', json: await lerCfg() };
  let b = {}; try { b = JSON.parse(corpo || '{}') || {}; } catch (_) {}
  const cfg = await lerCfg();
  if (Array.isArray(b.groups)) cfg.groups = b.groups.filter(g => g && /@g\.us$/.test(String(g.id || ''))).map(g => ({ id: String(g.id), name: String(g.name || '').slice(0, 120) })).slice(0, 20);
  if (Array.isArray(b.monitor)) cfg.monitor = b.monitor.filter(g => g && /@(g|c)\.us$/.test(String(g.id || ''))).map(g => ({ id: String(g.id), name: String(g.name || '').slice(0, 120) })).slice(0, 4);
  if (Array.isArray(b.pins)) cfg.pins = [...new Set(b.pins.map(String))].filter(id => CHAT_ID_RE.test(id)).slice(0, 30);
  if (b.tags && typeof b.tags === 'object') cfg.tags = normTags(b.tags);
  if (b.kinds && typeof b.kinds === 'object') for (const [k, v] of Object.entries(b.kinds)) cfg.kinds[String(k).slice(0, 40)] = !!v;
  cfg.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ jarvisWaCfg: { groups: cfg.groups, monitor: cfg.monitor, pins: cfg.pins, tags: cfg.tags, kinds: cfg.kinds, updatedAt: cfg.updatedAt } });
  return { status: 200, tipo: 'json', json: await lerCfg() };
}

async function enviarAbaWA(aba, req) {
  const fim = Date.now() + 25000;
  for (;;) {
    try { return await chrome.tabs.sendMessage(aba.id, { tipo: 'req', metodo: req.metodo, caminho: req.caminho, corpo: req.corpo }); }
    catch (_e) {
      // a aba acabou de abrir/recarregar e o relé ainda não carregou
      if (Date.now() > fim) return { status: 503, tipo: 'json', json: { error: 'A aba do WhatsApp Web não respondeu. Abra web.whatsapp.com neste navegador.' } };
      await sleep(1000);
    }
  }
}
async function tratarReq(req) {
  const rota = String(req.caminho || '').split('?')[0];
  if (rota === '/api/notify-config') return tratarCfg(String(req.metodo || 'GET').toUpperCase(), req.corpo);
  if (rota === '/api/notify' || rota === '/api/notify-test') return { status: 200, tipo: 'json', json: { ok: true, skipped: 'envio automático desativado' } };
  if (rota.startsWith('/api/dispositivo') || rota === '/api/tunel') return { status: 404, tipo: 'json', json: { error: 'Não se aplica a este modo.' } };
  const aba = await abaWA(true);
  const r = await enviarAbaWA(aba, req);
  if (rota === '/api/status' && r && r.json && r.json.status === 'qr') await trazerParaFrente(aba);
  if (rota === '/api/status' && r && r.json && r.json.status === 'ready') { try { await chrome.storage.session.set({ jarvisWaFrente: false }); } catch (_) {} }
  return r;
}
async function difundir(evento) {
  const abas = await chrome.tabs.query({ url: URL_PAINEL });
  for (const t of abas) { try { chrome.tabs.sendMessage(t.id, { tipo: 'evt-painel', evento }).catch(() => {}); } catch (_) {} }
}
chrome.runtime.onMessage.addListener((m, _sender, responder) => {
  if (!m) return;
  if (m.tipo === 'req') { tratarReq(m).then(responder).catch(e => responder({ status: 500, tipo: 'json', json: { error: (e && e.message) || String(e) } })); return true; }
  if (m.tipo === 'evt') { difundir(m.evento); }
});
