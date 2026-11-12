/**
 * Agente do botão "BI ENC" (B2B Encerrados) — pedido do usuário 2026-11-12.
 *
 * Mesmo padrão do botão BI do B2B Abertos (pbi_export.js), mas para a base do B2B Encerrados:
 *   1. abre o relatório "[Reparos] Reparos Encerrados - Giga+ v2_Databricks" na página CCS;
 *   2. no filtro Gerente marca "Wellington Marcio";
 *   3. clica na barra "CMO - Reparo" do gráfico "Reparos Encerrados por Departamentos";
 *   4. botão direito no Total > Drill-through > Base de Reparos;
 *   5. "..." da tabela > Exportar dados > "Dados com layout atual" > Exportar;
 *   6. confere linhas exportadas = Total filtrado;
 *   7. abre o próprio painel_jarvis.html (sem rede de escrita), carrega o estado sincronizado e roda
 *      procEnc() — exatamente o "Anexar base" do Encerrados — e grava em data/sync-state.json só os
 *      campos da base do Encerrados (dEnc, lastEnc*, encPbiAplicadoAt, savedAt). Todos os aparelhos
 *      adotam a base mais nova (lastEncBaseAt) na próxima sincronização.
 *
 * O export já vem no mesmo layout da base anexada hoje (46 colunas: ticket_id, protocolo, …,
 * gerente, sla_ticket). Nada do arquivo vai para o repositório além do que o painel já guarda.
 * Sessão do Power BI: a mesma do BI do Abertos (secret PBI_SESSION na nuvem ou
 * D:\JarvisRunner\pbi-auth no PC do agente). Nunca digita credenciais.
 */
const { chromium } = require('playwright');
const https = require('https');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const zlib  = require('zlib');

const REPORT_URL = process.env.PBI_ENC_URL || 'https://app.powerbi.com/groups/me/apps/eafd5bdd-0f37-4837-9ab2-2e50f0f5092f/reports/7d0ecb04-b190-4516-93fe-d70b55f89fbc/2fea571eab4e4c33e757?ctid=7ebaa467-3ace-4a9c-ad91-4e84933a6607&experience=power-bi&clientSideAuth=0';
const GERENTE    = process.env.PBI_ENC_GERENTE || 'Wellington Marcio';
const BARRAS     = ['CMO - Reparo'];
const AUTH_DIR   = process.env.PBI_AUTH_DIR || 'D:\\JarvisRunner\\pbi-auth';
const STATE_FILE = path.join(AUTH_DIR, 'state.json');
const PANEL_FILE = process.env.PBI_PANEL_FILE || path.join(__dirname, '..', 'painel_jarvis.html');
const DRY_RUN    = process.env.PBI_DRY_RUN === '1';
const OUT_SYNC   = process.env.PBI_OUT_SYNC || '';
const GH_TOKEN   = process.env.GITHUB_TOKEN  || '';
const GH_REPO    = process.env.GITHUB_REPO   || 'iatimcll-blip/Acompanhamento-Jarvis';
const GH_BRANCH  = process.env.GITHUB_BRANCH || 'main';
const STATUS_FILE = 'data/pbi-enc-status.json';
const SYNC_FILE   = 'data/sync-state.json';
const PASSOS = 7;

const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

function ghRequest(method, urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'api.github.com', path: urlPath, method,
      headers: {
        ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'jarvis-pbi-enc-agent',
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
async function ghPut(filePath, buffer, message) {
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await ghRequest('GET', `/repos/${GH_REPO}/contents/${filePath}?ref=${GH_BRANCH}&t=${Date.now()}`);
      const body = { message, content: buffer.toString('base64'), branch: GH_BRANCH };
      if (!r.notFound && r.sha) body.sha = r.sha;
      return await ghRequest('PUT', `/repos/${GH_REPO}/contents/${filePath}`, body);
    } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 1500)); }
  }
}
let statusAtual = {};
async function status(patch) {
  statusAtual = { ...statusAtual, ...patch, updatedAt: new Date().toISOString() };
  if (patch.stepTxt) log('»', patch.stepTxt);
  if (DRY_RUN || !GH_TOKEN) return;
  try { await ghPut(STATUS_FILE, Buffer.from(JSON.stringify(statusAtual, null, 2)), `chore: status agente BI ENC (${statusAtual.state})`); }
  catch (e) { log('aviso: status não publicado:', e.message); }
}

function sessao() {
  const v = (process.env.PBI_SESSION || '').trim();
  if (v && !fs.existsSync(STATE_FILE)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, zlib.gunzipSync(Buffer.from(v, 'base64')));
    log('Sessão do Power BI carregada do secret.');
  }
  if (!fs.existsSync(STATE_FILE) && process.env.GITHUB_ACTIONS) throw Object.assign(new Error('O secret PBI_SESSION não está configurado no GitHub — o agente na nuvem não consegue abrir a sessão do Power BI.'), { code: 'config' });
  if (!fs.existsSync(STATE_FILE)) throw Object.assign(new Error('Sessão do Power BI não configurada — é preciso refazer o login do Power BI.'), { code: 'login_required' });
}

async function lerTotal(page) {
  const lbl = await page.locator('svg[aria-label^="Total "]').first().getAttribute('aria-label');
  const n = parseInt(String(lbl).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}
async function esperarMudar(page, antes, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { const t = await lerTotal(page); if (t !== null && t !== antes) return t; await page.waitForTimeout(500); }
  return await lerTotal(page);
}
async function esperarTotal(page, alvo, ms) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await lerTotal(page) === alvo) return true; await page.waitForTimeout(500); }
  return false;
}
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
  sessao();
  const ctx = await browser.newContext({ storageState: STATE_FILE, acceptDownloads: true, viewport: { width: 1600, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  try {
    await status({ step: 1, stepTxt: 'Abrindo o relatório Reparos Encerrados (página CCS)' });
    await page.goto(REPORT_URL, { waitUntil: 'commit', timeout: 120000 });
    const ok = await Promise.race([
      page.waitForSelector('svg[aria-label^="Total "]', { timeout: 150000 }).then(() => 'ok'),
      page.waitForSelector('input[name="loginfmt"], input[type="password"], #i0116, #i0118', { timeout: 150000 }).then(() => 'login')
    ]).catch(() => 'timeout');
    /* só conta como expirada se aparecer o FORMULÁRIO de login — a passagem rápida pelo login.microsoftonline.com para renovar a sessão sozinho (SSO silencioso) não é expiração */
    if (ok === 'login') throw Object.assign(new Error('A sessão do Power BI expirou — refaça o login e atualize o secret PBI_SESSION.'), { code: 'login_required' });
    if (ok !== 'ok') throw new Error('O relatório não carregou em 2,5 min (contador Total não apareceu).');
    await page.waitForTimeout(4000);
    const totalCcs = await lerTotal(page);

    await status({ step: 2, stepTxt: 'Filtrando Gerente = ' + GERENTE, totalCcs });
    const box = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h3')].find(x => x.textContent.trim() === 'Gerente');
      const vc = h && h.closest('visual-container'); const dd = vc && vc.querySelector('[role=combobox]');
      if (!dd) return null; const r = dd.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!box) throw new Error('Filtro "Gerente" não encontrado na página CCS (o relatório mudou?).');
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(1500);
    const item = page.locator('.slicerItemContainer').filter({ hasText: new RegExp('^\\s*' + GERENTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first();
    if (!(await item.count())) throw new Error('Gerente "' + GERENTE + '" não aparece no filtro do relatório.');
    await item.click(); await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    const totalGerente = await esperarMudar(page, totalCcs, 20000);
    if (!totalGerente || totalGerente === totalCcs) throw new Error('O filtro de Gerente não alterou o Total (continua ' + totalCcs + ').');
    await page.waitForTimeout(2000);

    await status({ step: 3, stepTxt: 'Selecionando CMO - Reparo', totalGerente });
    let soma = 0;
    for (let i = 0; i < BARRAS.length; i++) {
      const b = await localizarBarra(page, BARRAS[i]);
      if (!b) throw new Error(`Barra "${BARRAS[i]}" não encontrada no gráfico de Departamentos (o relatório mudou?).`);
      soma += b.v || 0;
      if (i === 0) await page.mouse.click(b.x, b.y);
      else { await page.keyboard.down('Control'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Control'); }
      await page.waitForTimeout(1500);
    }
    if (!(await esperarTotal(page, soma, 20000))) throw new Error(`Depois da seleção o Total ficou ${await lerTotal(page)} e não ${soma} (valor da barra).`);
    log('Total filtrado:', soma);

    await status({ step: 4, stepTxt: 'Drill-through › Base de Reparos', totalFiltrado: soma });
    await page.locator('svg[aria-label^="Total "]').first().click({ button: 'right' });
    await page.getByText('Drill-through', { exact: true }).first().hover();
    await page.getByText('Base de Reparos', { exact: true }).first().click();
    await page.waitForSelector('[role="columnheader"]', { timeout: 90000 });
    await page.waitForTimeout(4000);

    await status({ step: 5, stepTxt: 'Exportando a Base de Reparos (' + soma + ' chamados)' });
    const cab = await page.locator('[role="columnheader"]:visible').first().boundingBox();
    if (!cab) throw new Error('Tabela "Base de Reparos" não apareceu depois do drill-through.');
    await page.mouse.move(cab.x + cab.width / 2, cab.y + cab.height / 2);
    await page.mouse.move(cab.x + cab.width / 2 + 40, cab.y + cab.height / 2 + 40);
    await page.waitForTimeout(800);
    const mais = page.locator('[aria-label="Mais opções"]:visible, [aria-label="More options"]:visible');
    if (!(await mais.count())) throw new Error('Botão "Mais opções" da tabela não apareceu (o relatório mudou?).');
    let alvo = mais.first(), maxX = -1;
    for (let i = 0; i < await mais.count(); i++) { const bb = await mais.nth(i).boundingBox(); if (bb && bb.x > maxX) { maxX = bb.x; alvo = mais.nth(i); } }
    await alvo.click();
    await page.getByText('Exportar dados', { exact: true }).first().click();
    await page.getByText('Dados com layout atual', { exact: true }).first().click().catch(() => {});
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 240000 }),
      page.getByRole('button', { name: /^Exportar$/ }).last().click()
    ]);
    const tmp = path.join(os.tmpdir(), 'pbi_enc_' + Date.now() + '.xlsx');
    await download.saveAs(tmp);
    log('Arquivo exportado:', download.suggestedFilename(), '→', tmp);
    try { await ctx.storageState({ path: STATE_FILE }); } catch (_) {}
    return { tmp, totalCcs, totalGerente, totalFiltrado: soma, nomeArquivo: download.suggestedFilename() };
  } catch (e) {
    try { await page.screenshot({ path: path.join(AUTH_DIR, 'erro_enc.png') }); } catch (_) {}
    throw e;
  } finally { await ctx.close(); }
}

/* ── Aplica na sincronização com o próprio painel (procEnc) ─────────────────── */
async function lerSyncState() {
  const r = await ghRequest('GET', `/repos/${GH_REPO}/contents/${SYNC_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`);
  if (r.notFound) throw new Error('data/sync-state.json não encontrado');
  let b64 = r.content;
  if (!b64) { const bl = await ghRequest('GET', `/repos/${GH_REPO}/git/blobs/${r.sha}`); b64 = bl.content; }
  const raw = JSON.parse(Buffer.from(String(b64).replace(/\n/g, ''), 'base64').toString('utf8'));
  const st = raw && raw.z === 1 ? JSON.parse(zlib.gunzipSync(Buffer.from(raw.d, 'base64')).toString('utf8')) : raw;
  return { sha: r.sha, st };
}
async function montarBaseEnc(browser, estado, xlsxB64, nomeArquivo) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/^https?:/, r => /raw\.githubusercontent\.com/.test(r.request().url()) ? r.continue() : r.abort());
  try {
    await page.goto('file:///' + path.resolve(PANEL_FILE).split(path.sep).join('/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => typeof XLSX !== 'undefined' && typeof procEnc === 'function' && typeof applyState === 'function', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    return await page.evaluate(({ estado, xlsxB64, nomeArquivo }) => {
      window.saveState = () => {}; window.saveGhState = async () => false; window._ghToast = () => {}; window.autoSyncAfterBaseUpload = () => {};
      applyState(estado, 'agente BI ENC');
      const bin = Uint8Array.from(atob(xlsxB64), c => c.charCodeAt(0));
      const wb = XLSX.read(bin, { type: 'array' });
      const sn = wb.SheetNames.find(n => n.toUpperCase().includes('BASE')) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
      const linhas = rows.filter(r => (r['ticket_id'] || r['protocolo']) && !encLinhaRodape(r['protocolo'] || r['ticket_id'])).length;
      procEnc(rows, nomeArquivo);
      const b = buildState();
      return { dEnc: b.dEnc, lastEncAt: b.lastEncAt, lastEncBaseAt: b.lastEncBaseAt, lastEncFile: b.lastEncFile, n: dEnc.length, linhas,
        meses: [...new Set(dEnc.map(d => d.mes).filter(Boolean))].sort() };
    }, { estado, xlsxB64, nomeArquivo });
  } finally { await ctx.close(); }
}
async function aplicarNoSync(browser, xlsxB64, fileAt, totalFiltrado) {
  const d = new Date(fileAt);
  const nome = 'Power BI (botão BI ENC) ' + d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const ini = await lerSyncState();
  if (ini.st.lastEncBaseAt && ini.st.lastEncBaseAt > fileAt) throw new Error('Uma base do B2B Encerrados mais nova foi anexada durante a rodada — mantida, nada foi alterado.');
  const base = await montarBaseEnc(browser, ini.st, xlsxB64, nome);
  log('Painel montou', base.n, 'chamados de', base.linhas, 'linhas do export; meses', base.meses[0], 'a', base.meses[base.meses.length - 1]);
  if (base.linhas !== totalFiltrado) throw new Error(`O arquivo exportado tem ${base.linhas} chamados, mas o Total filtrado era ${totalFiltrado} — nada foi alterado.`);
  if (!Array.isArray(base.dEnc) || !base.dEnc.length) throw new Error('O painel não gerou nenhum chamado a partir do export — nada foi alterado.');
  for (let t = 1; t <= 4; t++) {
    const { sha, st } = await lerSyncState(); /* relê sempre antes de gravar: só os campos do Encerrados mudam */
    if (st.lastEncBaseAt && st.lastEncBaseAt > base.lastEncBaseAt) throw new Error('Uma base do B2B Encerrados mais nova foi anexada durante a rodada — mantida, nada foi alterado.');
    Object.assign(st, { dEnc: base.dEnc, lastEncAt: base.lastEncAt, lastEncBaseAt: base.lastEncBaseAt, lastEncFile: base.lastEncFile,
      encPbiAplicadoAt: fileAt, savedAt: new Date().toISOString() });
    const conteudo = Buffer.from(JSON.stringify({ z: 1, d: zlib.gzipSync(Buffer.from(JSON.stringify(st), 'utf8')).toString('base64') }), 'utf8');
    if (DRY_RUN) { if (OUT_SYNC) fs.writeFileSync(OUT_SYNC, conteudo); log('(teste) sync-state montado:', base.n, 'chamados,', conteudo.length, 'bytes'); return base; }
    try {
      await ghRequest('PUT', `/repos/${GH_REPO}/contents/${SYNC_FILE}`, { message: 'sync: base B2B Encerrados via botão BI ENC (' + base.n + ' chamados)', content: conteudo.toString('base64'), sha, branch: GH_BRANCH });
      log('Base do Encerrados aplicada na sincronização para todos os aparelhos:', base.n, 'chamados.');
      return base;
    } catch (e) {
      if (t === 4 || !/GitHub (409|422)/.test(e.message)) throw e;
      log('Conflito ao gravar a sincronização — tentando de novo…');
      await new Promise(r => setTimeout(r, 1500 * t));
    }
  }
}

async function rodada() {
  statusAtual = {};
  await status({ state: 'running', step: 0, stepTxt: 'Iniciando o agente do BI ENC', lastRunStartedAt: new Date().toISOString(), lastRunCompletedAt: '', lastRunConclusion: '', lastError: '', errorCode: '', aplicadoNoSync: false });
  const browser = await chromium.launch({ headless: process.env.PBI_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.PBI_CHROME ? { executablePath: process.env.PBI_CHROME } : {}) });
  try {
    const ex = await exportar(browser);
    await status({ step: 6, stepTxt: 'Conferindo o export e montando a base no painel' });
    const b64 = fs.readFileSync(ex.tmp).toString('base64');
    try { fs.unlinkSync(ex.tmp); } catch (_) {}
    const fileAt = new Date().toISOString();
    await status({ step: 7, stepTxt: 'Sincronizando a base para todos os aparelhos' });
    const base = await aplicarNoSync(browser, b64, fileAt, ex.totalFiltrado);
    await status({
      state: 'online', step: 8, stepTxt: 'Concluído', lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'success',
      totalCcs: ex.totalCcs, totalGerente: ex.totalGerente, totalFiltrado: ex.totalFiltrado, linhasExportadas: base.linhas, chamadosPainel: base.n,
      mesDe: base.meses[0] || '', mesAte: base.meses[base.meses.length - 1] || '', arquivoExportado: ex.nomeArquivo, fileAt, aplicadoNoSync: !DRY_RUN
    });
    log('Concluído.');
  } catch (e) {
    log('ERRO:', e.message);
    await status({ state: 'error', stepTxt: 'Erro', lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'failure', lastError: e.message, errorCode: e.code || '' });
    process.exitCode = 1;
  } finally { await browser.close(); }
}

if (require.main === module) rodada();
