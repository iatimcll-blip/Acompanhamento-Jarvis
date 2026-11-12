/**
 * Agente do botão "BI" (B2B Abertos/Swap/EVE) — pedido do usuário 2026-11-10.
 *
 * Repete no Power BI os passos que o usuário faria à mão e entrega a base ao painel
 * como se ela tivesse sido anexada em "Anexar base geral":
 *   1. abre o relatório "[Reparos] Reparos Abertos - Giga+ v2_Databricks" na página CCS
 *      (o link já abre direto em "Dashboard Geral Abertos CCS");
 *   2. lê o contador Total;
 *   3. seleciona as barras "CMO - Reparo" + (Ctrl) "CMO - REPARO SWAP" no gráfico
 *      "Total de Reparos Abertos x Departamento Atual" e confere Total = soma das barras;
 *   4. botão direito no Total > Drill-through > Base de Reparos;
 *   5. "..." da tabela > Exportar dados > "Dados com layout atual" > Exportar;
 *   6. confere linhas exportadas = Total;
 *   7. abre o próprio painel_jarvis.html (local, sem rede) e roda procAbBaseGeral() sobre o
 *      arquivo, para saber quais linhas o painel aproveitaria (PI/MA/PA/AM/AP, inclusive as
 *      sem UF com cidade inferida pelo Título) — só essas linhas vão para o repositório
 *      (que é público), com CNPJ e valor do serviço apagados;
 *   8. publica data/pbi_abertos.xlsx; o painel processa esse arquivo com o mesmo
 *      procAbBaseGeral() do botão "Anexar base geral".
 *
 * Login: o agente NUNCA digita credenciais. A sessão vem de um storageState (cookies) gravado
 * uma vez com `node pbi_export.js --login`, que abre uma janela para a pessoa entrar na conta
 * Microsoft. Se a sessão expirar, a rodada termina com erro "login_required" e o painel avisa.
 *
 * Status ao vivo em data/pbi-runner-status.json (passo, conclusão, erro, totais).
 */
const { chromium } = require('playwright');
const https = require('https');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const REPORT_URL = process.env.PBI_REPORT_URL || 'https://app.powerbi.com/groups/me/apps/eafd5bdd-0f37-4837-9ab2-2e50f0f5092f/reports/8a808511-3960-40ac-acf2-c4dbd2a4137f/a246be1db40e048a3595?ctid=7ebaa467-3ace-4a9c-ad91-4e84933a6607&experience=power-bi&clientSideAuth=0';
const AUTH_DIR   = process.env.PBI_AUTH_DIR || 'D:\\JarvisRunner\\pbi-auth';
const STATE_FILE = path.join(AUTH_DIR, 'state.json');
const PANEL_FILE = process.env.PBI_PANEL_FILE || path.join(__dirname, '..', 'painel_jarvis.html');
const BARRAS     = ['CMO - Reparo', 'CMO - REPARO SWAP'];
const DRY_RUN    = process.env.PBI_DRY_RUN === '1';      // testa tudo sem publicar no GitHub
const OUT_LOCAL  = process.env.PBI_OUT_LOCAL || '';       // (teste) grava o xlsx filtrado aqui

const GH_TOKEN  = process.env.GITHUB_TOKEN  || '';
const GH_REPO   = process.env.GITHUB_REPO   || 'iatimcll-blip/Acompanhamento-Jarvis';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';
const STATUS_FILE = 'data/pbi-runner-status.json';
const DATA_FILE   = 'data/pbi_abertos.xlsx';

/* ── Sessão vinda do secret do GitHub (rodar na nuvem, sem depender do PC do agente) ──
   Pedido do usuário 2026-11-10 (opção B): o workflow roda num servidor do GitHub e a sessão do
   Power BI vem SÓ do secret PBI_SESSION (base64 de gzip do storageState, apenas cookies) —
   nada da sessão vai para o repositório (que é público). Não há renovação automática: quando
   a Microsoft expirar a sessão, refaz-se o login (--login) e atualiza-se o secret com o
   arquivo D:\JarvisRunner\pbi-auth\session.secret.txt que o login gera. */
const zlib = require('zlib');
function sessaoDoSecret() {
  const v = (process.env.PBI_SESSION || '').trim();
  if (!v || fs.existsSync(STATE_FILE)) return false;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, zlib.gunzipSync(Buffer.from(v, 'base64')));
  log('Sessão do Power BI carregada do secret.');
  return true;
}
function gerarArquivoSecret() {
  const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const b64 = zlib.gzipSync(JSON.stringify({ cookies: st.cookies || [], origins: [] })).toString('base64');
  const out = path.join(AUTH_DIR, 'session.secret.txt');
  fs.writeFileSync(out, b64);
  return { out, tamanho: b64.length };
}

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

/* ── GitHub (mesmo padrão do atrix_agent.js) ─────────────────────────────── */
function ghRequest(method, urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'api.github.com', path: urlPath, method,
      headers: {
        ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jarvis-pbi-agent',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => {
        if (res.statusCode === 404) return resolve({ notFound: true });
        if (res.statusCode >= 400) return reject(new Error(`GitHub ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
async function ghSha(filePath) {
  const r = await ghRequest('GET', `/repos/${GH_REPO}/contents/${filePath}?ref=${GH_BRANCH}&t=${Date.now()}`);
  return r.notFound ? null : r.sha;
}
async function ghPut(filePath, buffer, message) {
  for (let t = 1; t <= 3; t++) {
    try {
      const sha = await ghSha(filePath);
      const body = { message, content: buffer.toString('base64'), branch: GH_BRANCH };
      if (sha) body.sha = sha;
      return await ghRequest('PUT', `/repos/${GH_REPO}/contents/${filePath}`, body);
    } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 1500)); }
  }
}
let statusAtual = {};
async function status(patch) {
  statusAtual = { ...statusAtual, ...patch, updatedAt: new Date().toISOString() };
  if (patch.stepTxt) log('»', patch.stepTxt);
  if (DRY_RUN || !GH_TOKEN) return;
  try { await ghPut(STATUS_FILE, Buffer.from(JSON.stringify(statusAtual, null, 2)), `chore: status agente BI (${statusAtual.state})`); }
  catch (e) { log('aviso: status não publicado:', e.message); }
}

/* ── Login (uma vez, com a pessoa na frente da tela) ─────────────────────── */
async function login() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
  const ctx = await chromium.launchPersistentContext(path.join(AUTH_DIR, 'profile'), {
    headless: false, ...(exe ? { executablePath: exe } : {}), viewport: { width: 1400, height: 850 }
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' });
  log('Janela aberta. Entre na sua conta Microsoft (marque "Continuar conectado"). Aguardando o relatório carregar (até 10 min)…');
  /* Espera em QUALQUER aba da janela (o login da Microsoft pode abrir/fechar abas) até o
     contador Total do relatório aparecer. Só desiste se a janela inteira for fechada. */
  const fim = Date.now() + 10 * 60000;
  let pronto = false, ultimoGoto = 0;
  while (!pronto && Date.now() < fim) {
    const abas = ctx.pages();
    if (!abas.length) throw new Error('A janela de login foi fechada antes de o relatório carregar.');
    for (const p of abas) {
      try { if (await p.locator('svg[aria-label^="Total "]').count()) { pronto = true; break; } } catch (_) {}
    }
    /* Já logado, mas o Power BI parou em outra página do app (ex.: "Menu"): leva ao relatório. */
    if (!pronto) {
      const p = abas[abas.length - 1];
      const u = p.url();
      if (/app\.powerbi\.com/.test(u) && !/singleSignOn|login/i.test(u) && !u.includes('a246be1db40e048a3595') && Date.now() - ultimoGoto > 30000) {
        ultimoGoto = Date.now();
        log('Logado — abrindo o relatório…');
        await p.goto(REPORT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (!pronto) throw new Error('O relatório não carregou em 10 min.');
  await new Promise(r => setTimeout(r, 3000));
  await ctx.storageState({ path: STATE_FILE });
  log('Sessão gravada em', STATE_FILE);
  const sec = gerarArquivoSecret();
  log('Arquivo para o secret PBI_SESSION gerado em', sec.out, '(' + sec.tamanho + ' caracteres) — atualize o secret no GitHub para a nuvem usar o login novo.');
  await ctx.close();
}

/* ── Passos no Power BI ──────────────────────────────────────────────────── */
async function lerTotal(page) {
  const lbl = await page.locator('svg[aria-label^="Total "]').first().getAttribute('aria-label');
  const n = parseInt(String(lbl).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}
async function esperarTotal(page, alvo, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await lerTotal(page) === alvo) return true; await page.waitForTimeout(500); }
  return false;
}
/* Barra do gráfico pelo rótulo do eixo: o rótulo é <text class="setFocusRing"><title>CMO - Reparo</title>
   e a barra é <rect class="bar" role="option" aria-label="115"> na mesma altura. */
async function localizarBarra(page, nome) {
  return page.evaluate(nome => {
    const t = [...document.querySelectorAll('text.setFocusRing')].find(e => e.querySelector('title') && e.querySelector('title').textContent.trim() === nome);
    if (!t) return null;
    const vc = t.closest('visual-container') || document;
    const ty = t.getBoundingClientRect(); const cy = ty.y + ty.height / 2;
    let best = null;
    for (const r of vc.querySelectorAll('rect.bar')) {
      const b = r.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const d = Math.abs(b.y + b.height / 2 - cy);
      if (!best || d < best.d) best = { d, x: b.x + Math.min(b.width / 2, 20), y: b.y + b.height / 2, v: parseInt(r.getAttribute('aria-label'), 10) };
    }
    return best && best.d < 12 ? best : null;
  }, nome);
}

async function exportar(browser) {
  try { sessaoDoSecret(); } catch (e) { throw Object.assign(new Error('O secret PBI_SESSION está inválido (' + e.message + ') — refaça o login do Power BI e atualize o secret.'), { code: 'login_required' }); }
  if (!fs.existsSync(STATE_FILE) && process.env.GITHUB_ACTIONS) throw Object.assign(new Error('O secret PBI_SESSION não está configurado no GitHub — o agente na nuvem não consegue abrir a sessão do Power BI.'), { code: 'config' });
  if (!fs.existsSync(STATE_FILE)) throw Object.assign(new Error('Sessão do Power BI não configurada — é preciso refazer o login do Power BI (node pbi_export.js --login).'), { code: 'login_required' });
  const ctx = await browser.newContext({ storageState: STATE_FILE, acceptDownloads: true, viewport: { width: 1600, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  try {
    await status({ step: 1, stepTxt: 'Abrindo o relatório no Power BI' });
    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const ok = await Promise.race([
      page.waitForSelector('svg[aria-label^="Total "]', { timeout: 120000 }).then(() => 'ok'),
      page.waitForSelector('input[name="loginfmt"], input[type="password"], #i0116, #i0118', { timeout: 120000 }).then(() => 'login')
    ]).catch(() => 'timeout');
    /* só conta como expirada se aparecer o FORMULÁRIO de login — a passagem rápida pelo login.microsoftonline.com para renovar a sessão sozinho (SSO silencioso) não é expiração */
    if (ok === 'login') throw Object.assign(new Error('A sessão do Power BI expirou — refaça o login (node pbi_export.js --login) e atualize o secret PBI_SESSION no GitHub.'), { code: 'login_required' });
    if (ok !== 'ok') throw new Error('O relatório não carregou em 2 min (contador Total não apareceu).');
    await page.waitForTimeout(3000);

    await status({ step: 2, stepTxt: 'Lendo o Total da página CCS' });
    const totalCcs = await lerTotal(page);
    log('Total CCS:', totalCcs);

    await status({ step: 3, stepTxt: 'Selecionando CMO - Reparo + CMO - REPARO SWAP' });
    let soma = 0;
    for (let i = 0; i < BARRAS.length; i++) {
      const b = await localizarBarra(page, BARRAS[i]);
      if (!b) throw new Error(`Barra "${BARRAS[i]}" não encontrada no gráfico Departamento Atual (o relatório mudou?).`);
      soma += b.v || 0;
      if (i === 0) await page.mouse.click(b.x, b.y);
      else { await page.keyboard.down('Control'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Control'); }
      await page.waitForTimeout(1500);
    }
    if (!(await esperarTotal(page, soma, 15000))) throw new Error(`Depois da seleção o Total ficou ${await lerTotal(page)} e não ${soma} (soma das barras).`);
    log('Total filtrado:', soma);

    await status({ step: 4, stepTxt: 'Drill-through › Base de Reparos', totalCcs, totalFiltrado: soma });
    const card = page.locator('svg[aria-label^="Total "]').first();
    await card.click({ button: 'right' });
    await page.getByText('Drill-through', { exact: true }).first().hover();
    await page.getByText('Base de Reparos', { exact: true }).first().click();
    await page.waitForFunction(() => !document.querySelector('svg[aria-label^="Total "]') || /Base de Reparos/i.test(document.title + location.href) || document.querySelectorAll('[role="columnheader"]').length > 5, null, { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('[role="columnheader"]', { timeout: 30000 });
    await page.waitForTimeout(3000);

    await status({ step: 5, stepTxt: 'Exportando os dados da tabela' });
    /* o <visual-container> tem tamanho zero; o "..." só aparece com o mouse sobre a tabela */
    const cab = await page.locator('[role="columnheader"]:visible').first().boundingBox();
    if (!cab) throw new Error('Tabela "Base de Reparos" não apareceu depois do drill-through.');
    await page.mouse.move(cab.x + cab.width / 2, cab.y + cab.height / 2);
    await page.mouse.move(cab.x + cab.width / 2 + 40, cab.y + cab.height / 2 + 40);
    await page.waitForTimeout(800);
    const mais = page.locator('[aria-label="Mais opções"]:visible, [aria-label="More options"]:visible');
    if (!(await mais.count())) throw new Error('Botão "Mais opções" da tabela não apareceu (o relatório mudou?).');
    /* se houver mais de um visível, o da tabela é o mais à direita */
    let alvo = mais.first(), maxX = -1;
    for (let i = 0; i < await mais.count(); i++) { const bb = await mais.nth(i).boundingBox(); if (bb && bb.x > maxX) { maxX = bb.x; alvo = mais.nth(i); } }
    await alvo.click();
    await page.getByText('Exportar dados', { exact: true }).first().click();
    await page.getByText('Dados com layout atual', { exact: true }).first().click().catch(() => {});
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.getByRole('button', { name: /^Exportar$/ }).last().click()
    ]);
    const tmp = path.join(os.tmpdir(), 'pbi_export_' + Date.now() + '.xlsx');
    await download.saveAs(tmp);
    log('Arquivo exportado:', download.suggestedFilename(), '→', tmp);

    /* renova a sessão gravada (cookies atualizados) para não expirar à toa */
    try { await ctx.storageState({ path: STATE_FILE }); } catch (_) {}
    return { tmp, totalCcs, totalFiltrado: soma, nomeArquivo: download.suggestedFilename() };
  } catch (e) {
    try { const shot = path.join(AUTH_DIR, 'erro_ultimo.png'); await page.screenshot({ path: shot }); log('print do erro em', shot); } catch (_) {}
    throw e;
  } finally { await ctx.close(); }
}

/* ── Filtro com a própria regra do painel (procAbBaseGeral) ──────────────── */
async function filtrarComPainel(browser, xlsxPath) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/^https?:/, r => r.abort());   // painel local, sem rede (nada é sincronizado daqui)
  try {
    await page.goto('file:///' + path.resolve(PANEL_FILE).split(path.sep).join('/'), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof XLSX !== 'undefined' && typeof procAbBaseGeral === 'function', null, { timeout: 30000 });
    const b64 = fs.readFileSync(xlsxPath).toString('base64');
    return await page.evaluate(b64 => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const wb = XLSX.read(bin, { type: 'array' });
      const sn = wb.SheetNames.find(n => nk(n) === nk('Export')) || wb.SheetNames[0];
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      /* roda a regra real do painel sem efeitos colaterais */
      window.finishAbUpload = () => {}; window.saveState = () => {};
      procAbBaseGeral(applyTicketLinks(rows, ws), 'pbi');
      const ids = new Set(); dAb.forEach(d => { if (d.protocolo) ids.add(String(d.protocolo)); if (d.ticketId) ids.add(String(d.ticketId)); });
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const head = aoa[0].map(String);
      const iT = head.findIndex(h => /^ticket ?id$/i.test(h.trim())), iP = head.findIndex(h => /^protocolo$/i.test(h.trim()));
      const apagar = head.map((h, i) => /^(cnpj|valorservico)$/i.test(h.trim()) ? i : -1).filter(i => i >= 0);
      const linhas = aoa.slice(1).filter(r => !/^filtros aplicados/i.test(String(r[0] || '').trim()));
      const kept = linhas.filter(r => ids.has(String(r[iP] || '').trim()) || ids.has(String(r[iT] || '').trim()))
        .map(r => { const c = r.slice(); apagar.forEach(i => { c[i] = ''; }); return c; });
      const out = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([head, ...kept]), 'Export');
      return { b64: XLSX.write(out, { type: 'base64', bookType: 'xlsx' }), exportadas: linhas.length, mantidas: kept.length, chamadosPainel: dAb.length,
               porUf: dAb.reduce((m, d) => (m[d.uf] = (m[d.uf] || 0) + 1, m), {}) };
    }, b64);
  } finally { await ctx.close(); }
}

/* ── Aplicar a base direto na sincronização (todos os aparelhos) ─────────────
   Pedido do usuário 2026-11-10: "sempre sincronizar para todos os outros PCs ou dispositivos".
   Antes, a base exportada só entrava quando um Admin/Sr abria o painel. Agora o agente faz o
   mesmo que um aparelho faria ao "Anexar base geral": abre o próprio painel_jarvis.html (sem
   gravar nada por ele), carrega o estado sincronizado atual (applyState), roda
   procAbBaseGeral() + finishAbUpload() (que reaplica os substatus do Atrix) e grava em
   data/sync-state.json só os campos da base do B2B Abertos (dAb, lastAb*, abPbiAplicadoAt,
   savedAt). Cada aparelho adota a base mais nova (lastAbBaseAt) na próxima sincronização
   (até 5 min, ou na hora para quem clicou). Conflito de escrita = relê e tenta de novo. */
const SYNC_FILE = 'data/sync-state.json';
async function lerSyncState() {
  const r = await ghRequest('GET', `/repos/${GH_REPO}/contents/${SYNC_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`);
  if (r.notFound) throw new Error('data/sync-state.json não encontrado');
  let b64 = r.content;
  if (!b64) { const bl = await ghRequest('GET', `/repos/${GH_REPO}/git/blobs/${r.sha}`); b64 = bl.content; }
  const raw = JSON.parse(Buffer.from(String(b64).replace(/\n/g, ''), 'base64').toString('utf8'));
  const st = raw && raw.z === 1 ? JSON.parse(zlib.gunzipSync(Buffer.from(raw.d, 'base64')).toString('utf8')) : raw;
  return { sha: r.sha, st };
}
async function montarBaseNoPainel(browser, estado, xlsxB64, nomeArquivo) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  /* só o raw do GitHub (atrix_updates.json para reaplicar os substatus do Atrix); o Worker e
     qualquer gravação ficam bloqueados — quem grava é este script. */
  await page.route(/^https?:/, r => /raw\.githubusercontent\.com/.test(r.request().url()) ? r.continue() : r.abort());
  try {
    await page.goto('file:///' + path.resolve(PANEL_FILE).split(path.sep).join('/'), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof XLSX !== 'undefined' && typeof procAbBaseGeral === 'function' && typeof applyState === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    return await page.evaluate(async ({ estado, xlsxB64, nomeArquivo }) => {
      window.saveState = () => {}; window.saveGhState = async () => false; window._ghToast = () => {};
      applyState(estado, 'agente BI');
      const bin = Uint8Array.from(atob(xlsxB64), c => c.charCodeAt(0));
      const wb = XLSX.read(bin, { type: 'array' });
      const sn = wb.SheetNames.find(n => nk(n) === nk('Export')) || wb.SheetNames[0];
      const ws = wb.Sheets[sn];
      procAbBaseGeral(applyTicketLinks(XLSX.utils.sheet_to_json(ws, { defval: '' }), ws), nomeArquivo);
      /* finishAbUpload chama loadAtrixUpdates (assíncrono): espera ele reaplicar os substatus */
      for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (typeof _atrixLoading === 'undefined' || !_atrixLoading) { if (i >= 6) break; } }
      const b = buildState();
      return { dAb: b.dAb, lastAbAt: b.lastAbAt, lastAbBaseAt: b.lastAbBaseAt, lastAbFile: b.lastAbFile, abLastUpd: b.abLastUpd, n: dAb.length };
    }, { estado, xlsxB64, nomeArquivo });
  } finally { await ctx.close(); }
}
async function aplicarNoSync(browser, xlsxB64, fileAt) {
  const d = new Date(fileAt);
  const nome = 'Power BI (botão BI) ' + d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const ini = await lerSyncState();
  if (ini.st.lastAbBaseAt && ini.st.lastAbBaseAt > fileAt) throw new Error('Uma base do B2B Abertos mais nova foi anexada durante a rodada — mantida, nada foi alterado.');
  const base = await montarBaseNoPainel(browser, ini.st, xlsxB64, nome);
  if (!Array.isArray(base.dAb) || !base.dAb.length) throw new Error('O painel não gerou nenhum chamado a partir do export — nada foi alterado.');
  for (let t = 1; t <= 4; t++) {
    const { sha, st } = await lerSyncState(); /* relê SEMPRE antes de gravar: só os campos do Abertos mudam, o resto fica como outro aparelho deixou */
    if (st.lastAbBaseAt && st.lastAbBaseAt > base.lastAbBaseAt) throw new Error('Uma base do B2B Abertos mais nova foi anexada durante a rodada — mantida, nada foi alterado.');
    Object.assign(st, { dAb: base.dAb, dAbCleared: false, dAbClearedAt: '', lastAbAt: base.lastAbAt, lastAbBaseAt: base.lastAbBaseAt,
      lastAbFile: base.lastAbFile, abLastUpd: base.abLastUpd, abPbiAplicadoAt: fileAt, savedAt: new Date().toISOString() });
    const conteudo = Buffer.from(JSON.stringify({ z: 1, d: zlib.gzipSync(Buffer.from(JSON.stringify(st), 'utf8')).toString('base64') }), 'utf8');
    try {
      if (DRY_RUN) { if (process.env.PBI_OUT_SYNC) fs.writeFileSync(process.env.PBI_OUT_SYNC, conteudo); log('(teste) sync-state montado:', base.n, 'chamados,', conteudo.length, 'bytes'); return base.n; }
      await ghRequest('PUT', `/repos/${GH_REPO}/contents/${SYNC_FILE}`, { message: 'sync: base B2B Abertos via botão BI (' + base.n + ' chamados)', content: conteudo.toString('base64'), sha, branch: GH_BRANCH });
      log('Base aplicada na sincronização para todos os aparelhos:', base.n, 'chamados.');
      return base.n;
    } catch (e) {
      if (t === 4 || !/GitHub (409|422)/.test(e.message)) throw e;
      log('Conflito ao gravar a sincronização (outro aparelho salvou junto) — tentando de novo…');
      await new Promise(r => setTimeout(r, 1500 * t));
    }
  }
}

/* ── Rodada ──────────────────────────────────────────────────────────────── */
async function rodada() {
  const startedAt = new Date().toISOString();
  statusAtual = {};
  await status({ state: 'running', step: 0, stepTxt: 'Iniciando o agente do BI', lastRunStartedAt: startedAt, lastRunCompletedAt: '', lastRunConclusion: '', lastError: '', errorCode: '' });
  const browser = await chromium.launch({ headless: process.env.PBI_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.PBI_CHROME ? { executablePath: process.env.PBI_CHROME } : {}) });
  try {
    const ex = await exportar(browser);
    await status({ step: 6, stepTxt: 'Conferindo e separando os chamados de PI/MA/PA/AM/AP' });
    const f = await filtrarComPainel(browser, ex.tmp);
    try { fs.unlinkSync(ex.tmp); } catch (_) {}
    log(`Exportadas ${f.exportadas} linhas (Total filtrado ${ex.totalFiltrado}); painel aproveita ${f.chamadosPainel}:`, JSON.stringify(f.porUf));
    if (f.exportadas !== ex.totalFiltrado) throw new Error(`O arquivo exportado tem ${f.exportadas} linhas, mas o Total filtrado era ${ex.totalFiltrado} — nada foi anexado.`);
    if (!f.chamadosPainel) throw new Error('Nenhum chamado de PI/MA/PA/AM/AP no export — nada foi anexado.');
    if (OUT_LOCAL) fs.writeFileSync(OUT_LOCAL, Buffer.from(f.b64, 'base64'));

    await status({ step: 7, stepTxt: 'Enviando a base para o painel' });
    let fileSha = '', commitSha = '';
    const fileAt = new Date().toISOString();
    if (!DRY_RUN) {
      const r = await ghPut(DATA_FILE, Buffer.from(f.b64, 'base64'), `data: base B2B Abertos via BI (${f.chamadosPainel} chamados)`);
      fileSha = (r && r.content && r.content.sha) || ''; commitSha = (r && r.commit && r.commit.sha) || '';
    }
    /* grava a base direto na sincronização (todos os aparelhos). Se falhar, o arquivo acima
       continua valendo: o primeiro Admin/Sr que abrir o painel aplica (caminho antigo). */
    let aplicadoNoSync = false, erroSync = '';
    if (GH_TOKEN || DRY_RUN) {
      await status({ step: 7, stepTxt: 'Sincronizando a base para todos os aparelhos' });
      try { await aplicarNoSync(browser, f.b64, fileAt); aplicadoNoSync = !DRY_RUN; }
      catch (e) { erroSync = e.message; log('aviso: base não aplicada na sincronização:', e.message); }
    }
    await status({
      state: 'online', step: 8, stepTxt: 'Concluído', lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'success',
      totalCcs: ex.totalCcs, totalFiltrado: ex.totalFiltrado, linhasExportadas: f.exportadas, chamadosPainel: f.chamadosPainel, porUf: f.porUf,
      arquivoExportado: ex.nomeArquivo, fileAt, fileSha, commitSha, aplicadoNoSync, erroSync
    });
    log('Concluído.');
  } catch (e) {
    log('ERRO:', e.message);
    await status({ state: 'error', stepTxt: 'Erro', lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'failure', lastError: e.message, errorCode: e.code || '' });
    process.exitCode = 1;
  } finally { await browser.close(); }
}

if (require.main === module) {
  if (process.argv.includes('--login')) login().catch(e => { console.error(e); process.exit(1); });
  else rodada();
}
module.exports = { filtrarComPainel, localizarBarra, lerTotal };
