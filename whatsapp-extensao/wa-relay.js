/* Relé na aba do WhatsApp Web: leva os pedidos do serviço de fundo até o adaptador (mundo da página) e
   devolve as respostas; também repassa os eventos em tempo real (mensagens novas, conexão). */
(function () {
  const ORIGEM = location.origin;
  const pendentes = new Map();
  let seq = 0;
  window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== ORIGEM) return;
    const d = ev.data;
    if (!d) return;
    if (d.jarvisWaResposta === true && pendentes.has(d.id)) { const f = pendentes.get(d.id); pendentes.delete(d.id); f(d.r); return; }
    if (d.jarvisWaEvento === true) { try { chrome.runtime.sendMessage({ tipo: 'evt', evento: d.evento }).catch(() => {}); } catch (_) {} }
  });
  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (!m || m.tipo !== 'req') return;
    const id = 'r' + (++seq) + '-' + Date.now();
    const t = setTimeout(() => { if (pendentes.delete(id)) responder({ status: 504, tipo: 'json', json: { error: 'O WhatsApp Web não respondeu a tempo.' } }); }, 55000);
    pendentes.set(id, r => { clearTimeout(t); responder(r); });
    window.postMessage({ jarvisWaPedido: true, id, metodo: m.metodo, caminho: m.caminho, corpo: m.corpo }, ORIGEM);
    return true;
  });
})();
