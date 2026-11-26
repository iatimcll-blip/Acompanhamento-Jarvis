/* Ponte entre a página do Jarvis e a extensão. Só roda nas páginas do Jarvis (ver manifest.json).
   A página fala por window.postMessage({jarvisAtrixPedido:true, tipo:...}); a ponte repassa ao serviço
   de fundo e devolve as respostas com {jarvisAtrixExt:true, tipo:...}. */
(function () {
  const ORIGEM = location.origin;
  const VERSAO = chrome.runtime.getManifest().version;
  let porta = null;
  const avisar = m => window.postMessage(Object.assign({ jarvisAtrixExt: true }, m), ORIGEM);
  function conectar() {
    if (porta) return porta;
    porta = chrome.runtime.connect({ name: 'jarvis-atrix' });
    porta.onMessage.addListener(m => avisar(m));
    porta.onDisconnect.addListener(() => { porta = null; avisar({ tipo: 'desconectado' }); });
    return porta;
  }
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== ORIGEM) return;
    const d = e.data;
    if (!d || d.jarvisAtrixPedido !== true) return;
    if (d.tipo === 'ping') { avisar({ tipo: 'pronto', versao: VERSAO }); return; }
    if (d.tipo === 'ler') { conectar().postMessage({ tipo: 'ler', tickets: d.tickets, seg: d.seg }); return; }
    if (d.tipo === 'cancelar' && porta) porta.postMessage({ tipo: 'cancelar' });
  });
  avisar({ tipo: 'pronto', versao: VERSAO });
})();
