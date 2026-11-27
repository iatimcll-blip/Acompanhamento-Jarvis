/* "Ponte virtual" dentro do navegador (roda no mundo da página do Jarvis, antes dos scripts dela).
   Quando o painel está no modo "WhatsApp deste aparelho", ele usa o endereço https://jarvis-wpp.local como se fosse
   a ponte do PC. Aqui interceptamos fetch e WebSocket desse endereço e respondemos com o WhatsApp Web deste
   navegador (via extensão); fotos, áudios, vídeos e arquivos são carregados e viram blob: antes de aparecer. */
(function () {
  if (window.__jarvisWppShim) return;
  window.__jarvisWppShim = true;
  const FAKE = 'https://jarvis-wpp.local';
  const ORIGEM = location.origin;
  const pend = new Map();
  const ouvintes = new Set();
  let seq = 0;

  window.addEventListener('message', ev => {
    if (ev.source !== window || ev.origin !== ORIGEM) return;
    const d = ev.data;
    if (!d || d.jarvisWppExt !== true) return;
    if (d.tipo === 'resp' && pend.has(d.id)) { const f = pend.get(d.id); pend.delete(d.id); f(d.r); }
    else if (d.tipo === 'evento') ouvintes.forEach(f => { try { f(d.evento); } catch (_) {} });
    else if (d.tipo === 'pronto') { window.__jarvisWppExtVersao = d.versao; window.dispatchEvent(new CustomEvent('jarvis-wpp-ext', { detail: d.versao })); }
  });
  function chamar(metodo, caminho, corpo) {
    return new Promise(res => {
      const id = 'p' + (++seq) + '-' + Date.now();
      const t = setTimeout(() => { pend.delete(id); res({ status: 504, tipo: 'json', json: { error: 'A extensão não respondeu.' } }); }, 70000);
      pend.set(id, r => { clearTimeout(t); res(r || { status: 503, tipo: 'json', json: { error: 'Sem resposta da extensão.' } }); });
      window.postMessage({ jarvisWppPedido: true, tipo: 'req', id, metodo, caminho, corpo }, ORIGEM);
    });
  }
  /* só abre na aba o que o navegador mostra sem executar código (igual à ponte do PC); o resto vira download */
  const INLINE = /^(image\/(png|jpe?g|gif|webp|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|text\/plain)$/i;
  function blobDe(b64, mime) {
    const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    const tipo = String(mime || '').split(';')[0].trim();
    return new Blob([u8], { type: INLINE.test(tipo) ? tipo : 'application/octet-stream' });
  }
  function comoResponse(r) {
    if (r.tipo === 'bin') { const b = blobDe(r.b64, r.mime); return new Response(b, { status: 200, headers: { 'Content-Type': b.type } }); }
    if (r.tipo === 'url') return new Response(JSON.stringify({ url: r.url }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (r.tipo === 'vazio') return new Response(null, { status: r.status || 404 });
    return new Response(JSON.stringify(r.json == null ? {} : r.json), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
  }

  /* fetch */
  const fetchOrig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : ((input && input.url) || String(input));
    if (!url.startsWith(FAKE)) return fetchOrig(input, init);
    const metodo = (init && init.method) || (input && input.method) || 'GET';
    const corpo = init && init.body != null ? String(init.body) : null;
    return chamar(metodo, url.slice(FAKE.length), corpo).then(comoResponse);
  };

  /* WebSocket */
  const WSOrig = window.WebSocket;
  class WSFalso extends EventTarget {
    constructor(url) {
      super();
      this.url = url; this.readyState = 0; this.protocol = ''; this.extensions = ''; this.bufferedAmount = 0; this.binaryType = 'blob';
      this.onopen = this.onmessage = this.onclose = this.onerror = null;
      this._f = e => this._msg(e);
      ouvintes.add(this._f);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1; this._emitir('open', new Event('open'));
        chamar('GET', '/api/status').then(r => { if (r && r.json) this._msg({ type: 'status', state: r.json }); });
      }, 0);
    }
    _emitir(n, ev) { const h = this['on' + n]; if (typeof h === 'function') { try { h.call(this, ev); } catch (e) { console.error(e); } } this.dispatchEvent(ev); }
    _msg(o) { if (this.readyState === 1) this._emitir('message', new MessageEvent('message', { data: JSON.stringify(o) })); }
    send() {}
    close() { if (this.readyState > 1) return; this.readyState = 3; ouvintes.delete(this._f); this._emitir('close', new CloseEvent('close')); }
  }
  WSFalso.CONNECTING = 0; WSFalso.OPEN = 1; WSFalso.CLOSING = 2; WSFalso.CLOSED = 3;
  window.WebSocket = new Proxy(WSOrig, {
    construct(alvo, args) {
      const u = String(args[0] || '');
      if (/^wss?:\/\/jarvis-wpp\.local/i.test(u)) return new WSFalso(u);
      return new alvo(...args);
    }
  });

  /* mídia e fotos: o painel monta <img src="https://jarvis-wpp.local/api/..."> etc.; aqui vira blob: */
  const cache = new Map();
  function obter(u) {
    const chave = u.split('#')[0];
    if (cache.has(chave)) return cache.get(chave);
    const p = chamar('GET', chave.slice(FAKE.length)).then(r => {
      if (!r || r.status !== 200) return null;
      if (r.tipo === 'url') return { url: r.url, nome: '' };
      if (r.tipo === 'bin') return { url: URL.createObjectURL(blobDe(r.b64, r.mime)), nome: r.nome || '' };
      return null;
    }).catch(() => null);
    cache.set(chave, p);
    p.then(x => { if (!x) cache.delete(chave); });
    return p;
  }
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); carregar(e.target); }
  }, { rootMargin: '300px' }) : null;
  function carregar(el) {
    const u = el.getAttribute('data-wpp-fonte'); if (!u) return;
    const hash = u.includes('#') ? '#' + u.split('#')[1] : '';
    obter(u).then(x => {
      if (x) el.setAttribute('src', x.url + hash);
      else el.dispatchEvent(new Event('error')); // roda o onerror original do painel ("indisponível")
    });
  }
  function hidratar(el) {
    if (!el || el.__wppH || !el.getAttribute) return;
    if (el.tagName === 'A') {
      const h = el.getAttribute('href');
      if (h && h.startsWith(FAKE)) { el.__wppH = 1; el.setAttribute('data-wpp-href', h); el.setAttribute('href', '#'); }
      return;
    }
    if (!/^(IMG|AUDIO|VIDEO|SOURCE)$/.test(el.tagName)) return;
    const u = el.getAttribute('src');
    if (!u || !u.startsWith(FAKE)) return;
    el.__wppH = 1;
    el.setAttribute('data-wpp-fonte', u);
    el.removeAttribute('src'); // evita a tentativa de rede (e o onerror) antes da hora
    if (el.tagName === 'IMG' || !io) carregar(el); else io.observe(el);
  }
  function varrer(no) {
    if (!no || no.nodeType !== 1) return;
    hidratar(no);
    if (no.querySelectorAll) no.querySelectorAll('a[href^="' + FAKE + '"],img[src^="' + FAKE + '"],audio[src^="' + FAKE + '"],video[src^="' + FAKE + '"],source[src^="' + FAKE + '"]').forEach(hidratar);
  }
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(varrer); }).observe(document, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[data-wpp-href]');
    if (!a) return;
    e.preventDefault();
    const u = a.getAttribute('data-wpp-href');
    const baixar = /[?&]dl=1(&|$)/.test(u);
    const aba = baixar ? null : window.open('about:blank', '_blank');
    const limpa = u.replace(/([?&])dl=1(&|$)/, (_m, p, s) => (s ? p : '')).replace(/[?&]$/, '');
    obter(limpa).then(x => {
      if (!x) { if (aba) aba.close(); return; }
      if (baixar) { const l = document.createElement('a'); l.href = x.url; l.download = x.nome || 'arquivo'; document.body.appendChild(l); l.click(); l.remove(); }
      else if (aba) aba.location.href = x.url;
    });
  }, true);
})();
