'use strict';
/**
 * Jarvis — Agente Atrix (Node.js / Playwright)
 *
 * Fluxo:
 *   1. Lê credenciais do .env (configuradas via run.bat na primeira vez)
 *   2. Abre Atrix em contexto persistente headless (.atrix_session/)
 *   3. Faz login automático (ou reutiliza sessão ativa)
 *   4. Lê substatus de cada chamado e salva atrix_updates.json no GitHub
 *   5. Repete a cada 30 min automaticamente
 */

const { chromium } = require('playwright');
const https        = require('https');
const path         = require('path');
const fs           = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ── Configuração ─────────────────────────────────────────────────────────────
const ATRIX_BASE    = process.env.ATRIX_BASE_URL || 'https://atrix.mobtelecom.com.br/controle/';
const ATRIX_USER    = process.env.ATRIX_USER     || '';
const ATRIX_PASS    = process.env.ATRIX_PASS     || '';
const ATRIX_SUB_SEL = process.env.ATRIX_SUBSTATUS_SELECTOR || '';

const GH_TOKEN      = process.env.GITHUB_TOKEN  || '';
const GH_REPO       = process.env.GITHUB_REPO   || 'iatimcll-blip/Acompanhamento-Jarvis';
const GH_BRANCH     = process.env.GITHUB_BRANCH || 'main';
const INTERVAL_MIN  = parseInt(process.env.INTERVAL_MINUTES || '30', 10);
const DELAY_MS      = parseFloat(process.env.DELAY_SECONDS  || '2') * 1000;
const DEBUG         = ['1','true','yes'].includes((process.env.DEBUG || '').toLowerCase());
const SINGLE_CYCLE  = ['1','true','yes'].includes((process.env.SINGLE_CYCLE || '').toLowerCase());

const GH_TICKETS_FILE = 'data/atrix_tickets.json';
const GH_UPDATES_FILE = 'data/atrix_updates.json';
const SESSION_DIR     = path.join(__dirname, '.atrix_session');

// ── Logger ────────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, 'atrix_agent.log');
function log(level, ...args) {
  const now = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const ts   = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ` +
               `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const msg  = `${ts} [${level}] ${args.join(' ')}`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, msg + '\n', 'utf8');
}
const info  = (...a) => log('INFO ', ...a);
const warn  = (...a) => log('WARN ', ...a);
const error = (...a) => log('ERROR', ...a);
const dbg   = (...a) => { if (DEBUG) log('DEBUG', ...a); };

function fmtTime(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fmtDateTime(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ` +
         `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ── GitHub helpers ────────────────────────────────────────────────────────────
function ghRequest(method, urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const req  = https.request(
      {
        hostname: 'api.github.com',
        path: urlPath,
        method,
        headers: {
          Authorization:  `token ${GH_TOKEN}`,
          Accept:         'application/vnd.github.v3+json',
          'User-Agent':   'jarvis-atrix-agent',
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      res => {
        let data = '';
        res.on('data', d => (data += d));
        res.on('end', () => {
          if (res.statusCode === 404) { resolve({ notFound: true }); return; }
          if (res.statusCode >= 400)  { reject(new Error(`GitHub ${res.statusCode}: ${data.slice(0, 200)}`)); return; }
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ghGetFile(filePath) {
  const res = await ghRequest('GET', `/repos/${GH_REPO}/contents/${filePath}?ref=${GH_BRANCH}&t=${Date.now()}`);
  if (res.notFound) return { content: null, sha: null };
  return {
    content: Buffer.from(res.content.replace(/\n/g, ''), 'base64').toString('utf8'),
    sha: res.sha
  };
}

async function ghPutFile(filePath, contentStr, sha, message) {
  const body = { message, content: Buffer.from(contentStr, 'utf8').toString('base64'), branch: GH_BRANCH };
  if (sha) body.sha = sha;
  await ghRequest('PUT', `/repos/${GH_REPO}/contents/${filePath}`, body);
}

// ── Tickets e Updates ─────────────────────────────────────────────────────────
async function loadTickets() {
  const { content } = await ghGetFile(GH_TICKETS_FILE);
  if (!content) {
    warn('atrix_tickets.json nao encontrado — clique "Exportar p/ Agente" no painel.');
    return [];
  }
  const all      = JSON.parse(content);
  const withLink = all.filter(t => t.link);
  info(`${withLink.length} chamados com link (total: ${all.length}).`);
  return withLink;
}

async function loadUpdates() {
  const { content, sha } = await ghGetFile(GH_UPDATES_FILE);
  return { updates: content ? JSON.parse(content) : {}, sha };
}

async function saveUpdates(updates, sha) {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await ghPutFile(
    GH_UPDATES_FILE,
    JSON.stringify(updates, null, 2),
    sha,
    `chore: substatus Atrix (${ts}) [${Object.keys(updates).length} chamados]`
  );
  info(`atrix_updates.json salvo (${Object.keys(updates).length} chamados).`);
}

// ── Login automático ──────────────────────────────────────────────────────────
async function ensureLoggedIn(page) {
  info('Verificando sessao Atrix...');
  await page.goto(ATRIX_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  const needsLogin = !!(await page.$('input[type="password"]'));
  if (!needsLogin) { info('Sessao ativa — login nao necessario.'); return true; }

  if (!ATRIX_USER || !ATRIX_PASS) {
    error('Sessao expirada e credenciais nao configuradas. Execute run.bat para reconfigurar.');
    return false;
  }

  info('Fazendo login automatico...');
  try {
    const userSel = 'input[name="username"],input[name="email"],input[id*="user"],input[id*="email"]';
    await page.waitForSelector(userSel, { timeout: 8000 });
    await page.fill(userSel, ATRIX_USER);
    await page.fill('input[type="password"]', ATRIX_PASS);
    await page.click('input[type="submit"],button[type="submit"]');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1500);
    if (!(await page.$('input[type="password"]'))) {
      info('Login realizado com sucesso.');
      return true;
    }
    error('Login falhou. Verifique ATRIX_USER e ATRIX_PASS no .env');
    return false;
  } catch (e) {
    error('Erro no login:', e.message);
    return false;
  }
}

// ── Extração de substatus ─────────────────────────────────────────────────────
const SELECTORS = [
  'select[name="substatus"]',
  'select[name="sub_status"]',
  'select[id="substatus"]',
  'select[id*="substatus"]',
  'select[name*="substatus"]',
  'select[class*="substatus"]',
  'select[name="status"]',
];

// Valores que indicam campo vazio/não preenchido — ignorar
const BLANK_VALUES = new Set(['selecione','seleccione','select','nenhum','none','','—','-','--']);

async function selText(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  const v = await el.evaluate(el => {
    const opt = el.options && el.options[el.selectedIndex];
    return opt ? opt.text.trim() : '';
  });
  return v && !BLANK_VALUES.has(v.toLowerCase()) ? v : null;
}

async function extractSubstatus(page, ticket) {
  const tid = ticket.id || ticket.ticketId || '?';
  try {
    await page.goto(ticket.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Helper: detectar status Fechado/Cancelado no texto da página
    const checkClosedStatus = () => page.evaluate(() => {
      const txt = document.body.innerText || '';
      const m = txt.match(/Status\s*:\s*(Fechado|Cancelado|Encerrado|Closed|Cancelled)/i);
      return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
    });

    // ── Aguardar selects carregarem (SPA com hash routing) ───────────────────────
    // Quando o ticket está fechado o SPA pode não ter selects de substatus,
    // mas pode ter selects de navegação — aguardamos e depois filtramos.
    try {
      await page.waitForSelector('select', { timeout: 12000 });
    } catch {
      // Sem nenhum select: verificar se é ticket fechado/cancelado
      const cs = await checkClosedStatus();
      if (cs) { info(`[${tid}] Status: ${cs} (encerrado)`); return cs; }
      warn(`[${tid}] SPA nao renderizou selects em 12s.`);
      return null;
    }

    // ── Estratégia 2: seletor personalizado via .env ──────────────────────────────
    if (ATRIX_SUB_SEL) {
      const v = await selText(page, ATRIX_SUB_SEL);
      if (v) { dbg(`[${tid}] override selector: ${v}`); return v; }
    }

    // ── Estratégia 3: seletores nominais (name/id/class com "substatus") ─────────
    for (const sel of SELECTORS) {
      const v = await selText(page, sel);
      if (v) { dbg(`[${tid}] via "${sel}": ${v}`); return v; }
    }

    // ── Estratégia 4: buscar célula/label com texto "Substatus" e select adjacente ─
    // NÃO usa fallback posicional (ss[1]) pois capta campos errados (técnico, prioridade)
    const v = await page.evaluate((blanks) => {
      const optText = el => {
        if (!el || el.tagName !== 'SELECT') return null;
        const opt = el.options[el.selectedIndex];
        const t = opt ? opt.text.trim() : '';
        return t && !blanks.includes(t.toLowerCase()) ? t : null;
      };

      // Percorrer td, th, span, div, label, dt que contenham somente "Substatus"
      for (const cell of document.querySelectorAll('td,th,span,div,label,dt')) {
        const cellTxt = cell.textContent.trim().toLowerCase();
        if (cellTxt !== 'substatus' && !cellTxt.startsWith('substatus:') && !cellTxt.startsWith('sub-status')) continue;

        // Célula irmã (tabela horizontal)
        const next = cell.nextElementSibling;
        if (next) {
          const sel = next.tagName === 'SELECT' ? next : next.querySelector('select');
          const t = optText(sel);
          if (t) return t;
        }
        // Select dentro da linha/container pai
        const row = cell.closest('tr,div,fieldset,dl,form');
        if (row) {
          const sel = row.querySelector('select');
          const t = optText(sel);
          if (t) return t;
        }
      }
      return null;
    }, [...BLANK_VALUES]);

    if (v) { dbg(`[${tid}] via estrutura Substatus: ${v}`); return v; }

    // ── Verificação final: ticket fechado/cancelado (página já renderizada) ──────
    // SPA tinha selects de navegação mas nenhum de substatus — checar status
    const cs = await checkClosedStatus();
    if (cs) { info(`[${tid}] Status: ${cs} (encerrado)`); return cs; }

    // Nenhuma estratégia encontrou valor válido
    if (DEBUG) {
      const shot = path.join(__dirname, `debug_${tid}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      dbg(`[${tid}] Screenshot salvo: ${shot} — defina ATRIX_SUBSTATUS_SELECTOR no .env`);
    } else {
      warn(`[${tid}] Substatus nao encontrado.`);
    }
    return null;
  } catch (e) {
    if (e.name === 'TimeoutError') warn(`[${tid}] Timeout ao carregar ticket.`);
    else error(`[${tid}] Erro: ${e.message}`);
    return null;
  }
}

// ── Ciclo principal ───────────────────────────────────────────────────────────
async function runCycle() {
  const cycleStart = new Date();
  info('══════════════════════════════════════');
  info(`Ciclo iniciado em ${fmtDateTime(cycleStart)}`);
  info('══════════════════════════════════════');

  if (!GH_TOKEN) { error('GITHUB_TOKEN nao configurado no .env'); return; }
  if (!ATRIX_USER || !ATRIX_PASS) {
    error('Credenciais Atrix nao configuradas. Execute run.bat para configurar.');
    return;
  }

  const tickets = await loadTickets();
  if (!tickets.length) return;

  const { updates, sha } = await loadUpdates();
  let changed = 0;
  let errors  = 0;

  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless:  !DEBUG,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    args:      ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await ctx.newPage();

  try {
    if (!await ensureLoggedIn(page)) { await ctx.close(); return; }

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const tid    = ticket.id || ticket.ticketId || '';
      info(`[${i + 1}/${tickets.length}] ${tid}`);

      const old = (updates[tid] || {}).substatus || '';
      const sub = await extractSubstatus(page, ticket);

      if (sub) {
        updates[tid] = { substatus: sub, cliente: ticket.cliente || '', updatedAt: new Date().toISOString() };
        if (sub !== old) {
          info(`  ✓ "${old}" → "${sub}"`);
          changed++;
        } else {
          dbg(`  – sem mudanca (${sub})`);
        }
      } else {
        errors++;
      }

      if (i < tickets.length - 1) await page.waitForTimeout(DELAY_MS);
    }
  } finally {
    await ctx.close();
  }

  if (changed > 0 || !sha) await saveUpdates(updates, sha);

  // ── Resumo do ciclo ───────────────────────────────────────────────────────
  const cycleEnd  = new Date();
  const durationS = Math.round((cycleEnd - cycleStart) / 1000);
  const nextCycle = new Date(cycleEnd.getTime() + INTERVAL_MIN * 60 * 1000);

  info('══════════════════════════════════════');
  info(`Data/Hora : ${fmtDateTime(cycleEnd)}`);
  info(`Verificados: ${tickets.length} chamados`);
  info(`Alterados  : ${changed} substatuses`);
  if (errors) info(`Falhas     : ${errors} chamados sem leitura`);
  info(`Proximo    : ${fmtDateTime(nextCycle)} (em ${INTERVAL_MIN} min)`);
  info('══════════════════════════════════════');
}

// ── Agendamento ───────────────────────────────────────────────────────────────
async function main() {
  info(`Jarvis Atrix Agent iniciado. Modo: ${SINGLE_CYCLE ? 'ciclo único (CI)' : `intervalo ${INTERVAL_MIN} min`}`);

  if (!ATRIX_USER || !ATRIX_PASS) {
    error('Credenciais Atrix nao configuradas. Execute run.bat para configurar.');
    process.exit(1);
  }

  await runCycle();

  if (SINGLE_CYCLE) {
    info('Ciclo unico concluido.');
    process.exit(0);
  }

  setInterval(async () => {
    try { await runCycle(); }
    catch (e) { error('Ciclo falhou:', e.message); }
  }, INTERVAL_MIN * 60 * 1000);
}

main().catch(e => { error('Fatal:', e.message); process.exit(1); });
