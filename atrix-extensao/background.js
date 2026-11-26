/* Serviço de fundo da extensão "Jarvis · Leitor do Atrix".
   Recebe do Jarvis a lista de chamados, abre cada link do Atrix numa aba de fundo (com o acesso/sessão
   deste navegador), lê o Substatus e devolve o resultado chamado a chamado. Regras (as mesmas do agente):
     1. Substatus encontrado na página → usa o Substatus.
     2. Sem Substatus, com Status → usa o Status.
     3. Página do chamado aberta, sem Status e sem Substatus → "Fechado".
   Tela de login → para e avisa. Atrix recusando o acesso (403 Forbidden) em 3 chamados seguidos → para e avisa.
   Quem não carregar na 1ª volta é revisado uma vez no fim. */
const ATRIX = 'https://atrix.mobtelecom.com.br/';
const JARVIS = 'https://iatimcll-blip.github.io/Acompanhamento-Jarvis/';
let rodando = false, cancelar = false;

chrome.runtime.onConnect.addListener(porta => {
  if (porta.name !== 'jarvis-atrix') return;
  const origem = (porta.sender && porta.sender.url) || '';
  if (!origem.startsWith(JARVIS)) { porta.disconnect(); return; }
  porta.onMessage.addListener(async m => {
    if (!m || typeof m !== 'object') return;
    if (m.tipo === 'cancelar') { cancelar = true; return; }
    if (m.tipo !== 'ler') return;
    if (rodando) { porta.postMessage({ tipo: 'erro', msg: 'Já existe uma leitura do Atrix em andamento neste navegador.' }); return; }
    const tickets = (Array.isArray(m.tickets) ? m.tickets : []).filter(t => t && typeof t.link === 'string' && t.link.startsWith(ATRIX));
    const seg = Math.max(5, Math.min(60, Number(m.seg) || 20));
    rodando = true; cancelar = false;
    try { await rodar(porta, tickets, seg); }
    catch (e) { try { porta.postMessage({ tipo: 'erro', msg: 'Falha na leitura: ' + String((e && e.message) || e) }); } catch (_) {} }
    finally { rodando = false; }
  });
});

function esperarCarga(tabId, ms) {
  return new Promise(res => {
    let feito = false;
    const fim = () => { if (feito) return; feito = true; chrome.tabs.onUpdated.removeListener(ouvir); clearTimeout(t); res(); };
    const ouvir = (id, info) => { if (id === tabId && info.status === 'complete') fim(); };
    chrome.tabs.onUpdated.addListener(ouvir);
    const t = setTimeout(fim, ms);
  });
}
/* Passa por about:blank antes de cada chamado: os links só mudam o "#" e, sem a carga completa,
   o Atrix (SPA) não redesenha o chamado novo. */
async function abrir(tabId, url) {
  let p = esperarCarga(tabId, 5000);
  await chrome.tabs.update(tabId, { url: 'about:blank' });
  await p;
  p = esperarCarga(tabId, 30000);
  await chrome.tabs.update(tabId, { url });
  await p;
}

async function rodar(porta, T, seg) {
  const enviar = m => { try { porta.postMessage(m); } catch (_) {} };
  if (!T.length) { enviar({ tipo: 'fim', cancelado: false }); return; }
  const aba = await chrome.tabs.create({ url: 'about:blank', active: false });
  const tabId = aba.id;
  let bloqSeguidos = 0;
  try {
    let fila = T.slice();
    for (let volta = 0; volta < 2 && fila.length && !cancelar; volta++) {
      const revisar = [];
      for (let i = 0; i < fila.length; i++) {
        if (cancelar) break;
        const t = fila[i], tid = String(t.id || t.ticketId || '');
        enviar({ tipo: 'inicio', tid, i: i + 1, n: fila.length, volta });
        let r = null, diag = '';
        try {
          await abrir(tabId, t.link);
          const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: lerChamado, args: [seg, [String(t.id || ''), String(t.ticketId || '')]] });
          r = (res && res.result) || null;
        } catch (e) { r = null; diag = String((e && e.message) || e).slice(0, 200); }
        if (r && r.login) { enviar({ tipo: 'erro', msg: 'O Atrix pediu login neste navegador. Entre no Atrix (na mesma janela do Chrome) e clique em Atualizar de novo.' }); return; }
        if (r && r.bloqueado) {
          if (++bloqSeguidos >= 3) { enviar({ tipo: 'erro', msg: 'O Atrix recusou o acesso deste aparelho (403 Forbidden). Este aparelho está sem acesso ao Atrix.' }); return; }
        } else bloqSeguidos = 0;
        const vaiRevisar = !(r && r.value) && volta === 0 && !(r && r.bloqueado);
        if (vaiRevisar) revisar.push(t);
        enviar({ tipo: 'resultado', tid, r, volta, revisar: vaiRevisar, diag });
      }
      fila = revisar;
    }
    enviar({ tipo: 'fim', cancelado: cancelar });
  } finally {
    try { await chrome.tabs.remove(tabId); } catch (_) {}
  }
}

/* Roda DENTRO da página do chamado no Atrix. Espera até `seg` segundos pelo Substatus (ele carrega depois
   do Status); depois aplica Status ou Fechado. Não pode usar nada de fora desta função. */
async function lerChamado(seg, ids) {
  const BL = ['selecione', 'seleccione', 'select', 'nenhum', 'none', '', '—', '-', '--'];
  const nl = t => String(t || '').toLowerCase().replace(/[-\s:*]/g, '');
  const nl2 = t => String(t || '').toLowerCase().replace(/-/g, '').replace(/[\s:*]+$/, '').trim();
  const optT = el => { if (!el || el.tagName !== 'SELECT') return null; const o = el.options[el.selectedIndex]; const t = o ? o.text.trim() : ''; return t && !BL.includes(t.toLowerCase()) ? t : null; };
  const selDepois = (c, ct) => [...ct.querySelectorAll('select')].find(s => c.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
  const celulas = rot => [...document.querySelectorAll('td,th,span,div,label,dt')].filter(c => nl(c.textContent) === rot);
  const porRotulo = rot => {
    for (const c of celulas(rot)) {
      const nx = c.nextElementSibling;
      if (nx) { const t = optT(nx.tagName === 'SELECT' ? nx : nx.querySelector('select')); if (t) return t; }
      const row = c.closest('tr,div,fieldset,dl,form'); if (row) { const t = optT(selDepois(c, row)); if (t) return t; }
    }
    return null;
  };
  const texto = () => (document.body && document.body.innerText) || '';
  const acharSub = () => {
    for (const q of ['select[name="substatus"]', 'select[name="sub_status"]', 'select[id="substatus"]', 'select[id*="substatus"]', 'select[name*="substatus"]', 'select[class*="substatus"]']) { const t = optT(document.querySelector(q)); if (t) return t; }
    const r = porRotulo('substatus'); if (r) return r;
    for (const c of celulas('substatus')) { const nx = c.nextElementSibling; if (nx && nx.tagName !== 'SELECT' && !nx.querySelector('select')) { const v = nx.textContent.trim(); if (v && !BL.includes(v.toLowerCase()) && !v.includes('{{')) return v; } }
    const m = texto().match(/Substatus\s*:\s*([^\n\r]{1,40}?)(?:\s{2,}|$)/i); if (m) { const v = m[1].trim(); if (v && !BL.includes(v.toLowerCase())) return v; }
    return null;
  };
  const acharStatus = () => {
    const r = porRotulo('status'); if (r) return r;
    for (const s of document.querySelectorAll('select')) { const id = (s.id || '').toLowerCase(), nm = (s.name || '').toLowerCase(); if (id.includes('sub') || nm.includes('sub')) continue; if (id.includes('status') || nm.includes('status')) { const t = optT(s); if (t) return t; } }
    const m = texto().match(/Status\s*:\s*([^\n\r]{1,40}?)(?:\s{2,}|\s*Substatus\b|$)/i); if (m) { const v = m[1].trim(); if (v && !BL.includes(v.toLowerCase())) return v; }
    return null;
  };
  const campo = rot => { for (const c of document.querySelectorAll('td,th,span,div,label,dt')) { if (nl2(c.textContent) !== rot) continue; const nx = c.nextElementSibling; if (!nx) continue; const t = nx.textContent.trim(); if (t && !BL.includes(t.toLowerCase()) && !t.includes('{{')) return t; } return null; };
  const local = () => { const uf = campo('estado'), c = campo('cidade'); return { uf: uf ? uf.trim().toUpperCase() : '', cidade: c ? c.trim() : '' }; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fim = Date.now() + seg * 1000;
  while (Date.now() < fim) {
    if (document.querySelector('input[type="password"]') || /login/i.test(document.title || '')) return { login: true };
    if (/Forbidden|Default error page/i.test(document.title || '')) return { bloqueado: true };
    const s = acharSub(); if (s) return Object.assign({ value: s, source: 'substatus' }, local());
    await sleep(400);
  }
  const st = acharStatus(); if (st) return Object.assign({ value: st, source: 'status' }, local());
  /* sem Status e sem Substatus: Fechado, desde que a página do chamado tenha carregado (não em branco) */
  if (texto().trim().length >= 40) return Object.assign({ value: 'Fechado', source: 'fechado', verified: true }, local());
  return null;
}
