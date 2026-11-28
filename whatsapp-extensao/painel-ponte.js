/* Ponte entre a página do Jarvis e a extensão (roda só nas páginas do Jarvis, ver manifest.json).
   A página (painel-shim.js) fala por window.postMessage; aqui o pedido vai ao serviço de fundo e a resposta volta. */
(function () {
  const ORIGEM = location.origin;
  const VERSAO = chrome.runtime.getManifest().version;
  const avisar = m => window.postMessage(Object.assign({ jarvisWppExt: true }, m), ORIGEM);
  window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== ORIGEM) return;
    const d = ev.data;
    if (!d || d.jarvisWppPedido !== true) return;
    if (d.tipo === 'ping') { avisar({ tipo: 'pronto', versao: VERSAO }); return; }
    if (d.tipo === 'req') {
      try {
        chrome.runtime.sendMessage({ tipo: 'req', metodo: d.metodo, caminho: d.caminho, corpo: d.corpo })
          .then(r => avisar({ tipo: 'resp', id: d.id, r }))
          .catch(e => avisar({ tipo: 'resp', id: d.id, r: { status: 503, tipo: 'json', json: { error: 'Extensão indisponível: ' + ((e && e.message) || e) + ' (recarregue a página)' } } }));
      } catch (e) {
        avisar({ tipo: 'resp', id: d.id, r: { status: 503, tipo: 'json', json: { error: 'Extensão atualizada — recarregando a página…' } } });
        // este script ficou órfão depois da atualização: recarrega a página (no máximo 1 vez por minuto)
        try { const k = 'jarvisExtRecarga'; if (Date.now() - Number(sessionStorage.getItem(k) || 0) > 60000) { sessionStorage.setItem(k, String(Date.now())); setTimeout(() => location.reload(), 1500); } } catch (_) {}
      }
    }
  });
  chrome.runtime.onMessage.addListener(m => { if (m && m.tipo === 'evt-painel') avisar({ tipo: 'evento', evento: m.evento }); });
  avisar({ tipo: 'pronto', versao: VERSAO });
})();
