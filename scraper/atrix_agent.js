'use strict';
/**
 * Jarvis — Agente Atrix (Node.js / Playwright)
 *
 * Fluxo:
 *   1. Lê credenciais do .env (configuradas via run.bat na primeira vez)
 *   2. Abre Atrix em contexto persistente headless (.atrix_session/)
 *   3. Faz login automático (ou reutiliza sessão ativa)
 *   4. Lê substatus de cada chamado e salva atrix_updates.json no GitHub
 *   5. Publica o status do agente para qualquer dispositivo acompanhar
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
const INTERVAL_MIN  = parseInt(process.env.INTERVAL_MINUTES || '90', 10);
const DELAY_MS      = parseFloat(process.env.DELAY_SECONDS  || '2') * 1000;
const DEBUG         = ['1','true','yes'].includes((process.env.DEBUG || '').toLowerCase());
const SINGLE_CYCLE  = ['1','true','yes'].includes((process.env.SINGLE_CYCLE || '').toLowerCase());

const GH_TICKETS_FILE = 'data/atrix_tickets.json';
const GH_UPDATES_FILE = 'data/atrix_updates.json';
const GH_GATE_FILE    = 'data/atrix-gate.json';
const GH_RUNNER_STATUS_FILE = 'data/atrix-runner-status.json';
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
          ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'jarvis-atrix-agent',
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

// ── Gate público ──────────────────────────────────────────────────────────────
// Registra o último clique no botão "Iniciar" e serve como auditoria pública para
// qualquer dispositivo. O workflow só roda por workflow_dispatch.
function todayLocalStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadGate() {
  const { content, sha } = await ghGetFile(GH_GATE_FILE);
  return { gate: content ? JSON.parse(content) : {}, sha };
}

async function saveGate(gate, sha) {
  await ghPutFile(GH_GATE_FILE, JSON.stringify(gate, null, 2), sha, `chore: gate Atrix ${gate.lastManualTriggerDate || 'reset'}`);
}

async function publishRunnerStatus(patch) {
  if (!GH_TOKEN) return;
  try {
    let current = {};
    let sha = null;
    try {
      const file = await ghGetFile(GH_RUNNER_STATUS_FILE);
      sha = file.sha;
      current = file.content ? JSON.parse(file.content) : {};
    } catch (e) {
      warn('Nao foi possivel ler status publico anterior do agente:', e.message);
    }
    const status = {
      ...current,
      online: true,
      source: 'atrix_agent',
      runner: process.env.RUNNER_NAME || process.env.COMPUTERNAME || process.env.HOSTNAME || 'jarvis-runner',
      updatedAt: new Date().toISOString(),
      ...patch
    };
    await ghPutFile(
      GH_RUNNER_STATUS_FILE,
      JSON.stringify(status, null, 2),
      sha,
      `chore: status Agente Atrix ${status.state || 'online'}`
    );
  } catch (e) {
    warn('Falha ao publicar status publico do agente:', e.message);
  }
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

// Salva atrix_updates.json com proteção contra escrita concorrente — mais de uma
// máquina pode rodar o agente ao mesmo tempo (redundância/failover). Se o PUT falhar
// por conflito de sha (409, alguém salvou primeiro), busca a versão mais recente,
// mescla por chamado preferindo o registro com updatedAt mais novo, e tenta de novo.
async function saveUpdates(updates, sha, attempt = 1) {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  try {
    await ghPutFile(
      GH_UPDATES_FILE,
      JSON.stringify(updates, null, 2),
      sha,
      `chore: substatus Atrix (${ts}) [${Object.keys(updates).length} chamados]`
    );
    info(`atrix_updates.json salvo (${Object.keys(updates).length} chamados).`);
  } catch (e) {
    const isConflict = /GitHub 409/.test(e.message);
    if (!isConflict || attempt >= 4) throw e;

    warn(`Conflito ao salvar (outra maquina atualizou primeiro) — mesclando e tentando novamente (${attempt}/3)...`);
    await new Promise(r => setTimeout(r, 500 * attempt));
    const { content, sha: freshSha } = await ghGetFile(GH_UPDATES_FILE);
    const remote = content ? JSON.parse(content) : {};
    const merged = { ...remote };
    for (const [tid, up] of Object.entries(updates)) {
      const other = remote[tid];
      if (!other || !other.updatedAt || (up.updatedAt && up.updatedAt > other.updatedAt)) {
        merged[tid] = up;
      }
    }
    await saveUpdates(merged, freshSha, attempt + 1);
  }
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
];

// Valores que indicam campo vazio/não preenchido — ignorar
const BLANK_VALUES = new Set(['selecione','seleccione','select','nenhum','none','','—','-','--']);

// Quando o Status da página contém uma destas palavras, ela tem prioridade sobre
// o Substatus encontrado — regra de negócio: ticket fechado/cancelado sempre prevalece.
const CLOSED_CANCELLED_MAP = { fechado: 'Fechado', cancelado: 'Cancelado', encerrado: 'Encerrado', closed: 'Fechado', cancelled: 'Cancelado' };
function closedCancelledFrom(statusText) {
  if (!statusText) return null;
  const m = statusText.match(/\b(fechado|cancelado|encerrado|closed|cancelled)\b/i);
  return m ? CLOSED_CANCELLED_MAP[m[1].toLowerCase()] : null;
}

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

    // Helper: extrai o valor do Status da página (rótulo, select ou texto), sem restringir
    // a valores específicos — usado como fallback quando nenhum substatus é encontrado.
    // Ordem por confiabilidade: rótulo explícito > select nomeado > texto solto (evita
    // pegar selects de filtro/navegação que não pertencem ao ticket).
    const extractPageStatus = () => page.evaluate((blanks) => {
      const optText = el => {
        if (!el || el.tagName !== 'SELECT') return null;
        const opt = el.options[el.selectedIndex];
        const t = opt ? opt.text.trim() : '';
        return t && !blanks.includes(t.toLowerCase()) ? t : null;
      };
      // Normaliza rótulo removendo hífen e pontuação de campo obrigatório (":", "*")
      // no final — "Status *", "Status:" e "Status" devem casar igual.
      const normLabel = t => t.toLowerCase().replace(/-/g, '').replace(/[\s:*]+$/, '').trim();

      // 1. Rótulo/célula "Status" com select adjacente (mesma estrutura do Substatus)
      for (const cell of document.querySelectorAll('td,th,span,div,label,dt')) {
        if (normLabel(cell.textContent) !== 'status') continue;

        const next = cell.nextElementSibling;
        if (next) {
          const sel = next.tagName === 'SELECT' ? next : next.querySelector('select');
          const t = optText(sel);
          if (t) return t;
        }
        const row = cell.closest('tr,div,fieldset,dl,form');
        if (row) {
          const sel = row.querySelector('select');
          const t = optText(sel);
          if (t) return t;
        }
      }

      // 2. Select nomeado "status" (excluindo variantes de "substatus")
      for (const sel of document.querySelectorAll('select')) {
        const id = (sel.id || '').toLowerCase();
        const name = (sel.name || '').toLowerCase();
        if (id.includes('sub') || name.includes('sub')) continue;
        if (id.includes('status') || name.includes('status')) {
          const t = optText(sel);
          if (t) return t;
        }
      }

      // 3. Texto solto "Status : <valor>" em qualquer lugar da página — corta antes de
      // "Substatus"/espaço duplo para não colar com o campo seguinte na mesma linha.
      const txt = document.body.innerText || '';
      const m = txt.match(/Status\s*:\s*([^\n\r]{1,40}?)(?:\s{2,}|\s*Substatus\b|$)/i);
      if (m) {
        const v = m[1].trim();
        if (v && !blanks.includes(v.toLowerCase())) return v;
      }
      return null;
    }, [...BLANK_VALUES]);

    // ── Aguardar selects carregarem (SPA com hash routing) ───────────────────────
    // Quando o ticket está fechado o SPA pode não ter selects de substatus,
    // mas pode ter selects de navegação — aguardamos e depois filtramos.
    try {
      await page.waitForSelector('select', { timeout: 12000 });
    } catch {
      // Sem nenhum select: usar o Status encontrado na página, se houver
      const st = await extractPageStatus();
      const cc0 = closedCancelledFrom(st);
      if (cc0) { info(`[${tid}] Status: ${cc0} (fechado/cancelado)`); return cc0; }
      if (st) { info(`[${tid}] Substatus nao encontrado — usando Status: ${st}`); return st; }
      warn(`[${tid}] SPA nao renderizou selects em 12s.`);
      return null;
    }

    // ── Coleta o Substatus por todas as estratégias, sem retornar ainda ──────────
    // O Status da página é sempre conferido depois: se indicar Fechado/Cancelado,
    // tem prioridade sobre o Substatus encontrado (regra de negócio).
    let sub = null;

    // Estratégia 2: seletor personalizado via .env
    if (ATRIX_SUB_SEL) {
      sub = await selText(page, ATRIX_SUB_SEL);
      if (sub) dbg(`[${tid}] override selector: ${sub}`);
    }

    // Estratégia 3: seletores nominais (name/id/class com "substatus")
    if (!sub) {
      for (const sel of SELECTORS) {
        const found = await selText(page, sel);
        if (found) { sub = found; dbg(`[${tid}] via "${sel}": ${found}`); break; }
      }
    }

    // Estratégia 4: buscar célula/label com texto "Substatus" e select adjacente
    // NÃO usa fallback posicional (ss[1]) pois capta campos errados (técnico, prioridade)
    if (!sub) {
      sub = await page.evaluate((blanks) => {
        const optText = el => {
          if (!el || el.tagName !== 'SELECT') return null;
          const opt = el.options[el.selectedIndex];
          const t = opt ? opt.text.trim() : '';
          return t && !blanks.includes(t.toLowerCase()) ? t : null;
        };

        // Normaliza rótulo removendo hífen e pontuação de campo obrigatório (":", "*")
        // no final — "Substatus *", "Sub-Status:" e "Substatus" devem casar igual.
        const normLabel = t => t.toLowerCase().replace(/-/g, '').replace(/[\s:*]+$/, '').trim();

        // Percorrer td, th, span, div, label, dt que contenham somente "Substatus"
        for (const cell of document.querySelectorAll('td,th,span,div,label,dt')) {
          if (normLabel(cell.textContent) !== 'substatus') continue;

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
      if (sub) dbg(`[${tid}] via estrutura Substatus: ${sub}`);
    }

    // ── Estratégia 5: o Status da página tem prioridade quando indica Fechado/Cancelado ──
    const pageStatus = await extractPageStatus();
    const cc = closedCancelledFrom(pageStatus);
    if (cc) {
      if (sub && sub.trim().toLowerCase() !== cc.trim().toLowerCase()) info(`[${tid}] Status indica ${cc} — sobrepondo substatus "${sub}"`);
      else info(`[${tid}] Status: ${cc} (fechado/cancelado)`);
      return cc;
    }

    if (sub) return sub;

    // ── Fallback final: nenhum substatus encontrado — usar o Status da página ────
    if (pageStatus) { info(`[${tid}] Substatus nao encontrado — usando Status: ${pageStatus}`); return pageStatus; }

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
    await publishRunnerStatus({
      state: 'error',
      lastError: 'Credenciais Atrix nao configuradas',
      lastRunStartedAt: cycleStart.toISOString(),
      lastRunCompletedAt: new Date().toISOString(),
      lastRunConclusion: 'failure'
    });
    return;
  }

  await publishRunnerStatus({
    state: 'running',
    lastError: '',
    lastRunStartedAt: cycleStart.toISOString(),
    lastRunConclusion: ''
  });

  const tickets = await loadTickets();
  if (!tickets.length) {
    await publishRunnerStatus({
      state: 'online',
      lastError: 'Nenhum chamado exportado para leitura',
      lastRunCompletedAt: new Date().toISOString(),
      lastRunConclusion: 'no_tickets',
      lastTicketsChecked: 0,
      lastTicketsChanged: 0,
      lastTicketsErrors: 0
    });
    return;
  }

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
    if (!await ensureLoggedIn(page)) {
      await publishRunnerStatus({
        state: 'error',
        lastError: 'Login Atrix falhou ou sessao expirou',
        lastRunCompletedAt: new Date().toISOString(),
        lastRunConclusion: 'failure'
      });
      return;
    }

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

  await publishRunnerStatus({
    state: 'online',
    lastError: errors ? `${errors} chamado(s) sem leitura` : '',
    lastRunCompletedAt: cycleEnd.toISOString(),
    lastRunConclusion: errors ? 'partial' : 'success',
    lastTicketsChecked: tickets.length,
    lastTicketsChanged: changed,
    lastTicketsErrors: errors
  });
}

// ── Agendamento ───────────────────────────────────────────────────────────────
async function main() {
  info(`Jarvis Atrix Agent iniciado. Modo: ${SINGLE_CYCLE ? 'ciclo único (CI)' : `intervalo ${INTERVAL_MIN} min`}`);

  if (!ATRIX_USER || !ATRIX_PASS) {
    error('Credenciais Atrix nao configuradas. Execute run.bat para configurar.');
    await publishRunnerStatus({
      state: 'error',
      lastError: 'Credenciais Atrix nao configuradas',
      lastRunCompletedAt: new Date().toISOString(),
      lastRunConclusion: 'failure'
    });
    process.exit(1);
  }

  if (SINGLE_CYCLE) {
    const eventName = process.env.GITHUB_EVENT_NAME || '';
    const today = todayLocalStr();

    if (eventName && !['workflow_dispatch', 'schedule'].includes(eventName)) {
      info(`Evento ${eventName} ignorado — o Agente Atrix atualiza apenas por agendamento de 30 min ou pelo botao Iniciar.`);
      process.exit(0);
    }

    if (eventName === 'workflow_dispatch' || !eventName) {
      // Clique manual em "Iniciar": registra a ativação de hoje para auditoria
      // publica. O schedule de 30 min roda independentemente deste gate.
      try {
        const { gate, sha } = await loadGate();
        await saveGate({
          ...gate,
          lastManualTriggerDate: today,
          lastManualTriggerAt: new Date().toISOString(),
          source: 'atrix_agent'
        }, sha);
        info(`Disparo manual registrado para ${today}.`);
      } catch (e) { warn('Falha ao registrar disparo manual (gate):', e.message); }
    } else if (eventName === 'schedule') {
      info('Disparo automatico por schedule GitHub — ciclo de 30 min.');
    }

    // CI (GitHub Actions): deixa o erro propagar — uma falha aqui deve marcar o
    // job como failure (exit 1), para ficar visível no histórico de execuções.
    try {
      await runCycle();
    } catch (e) {
      await publishRunnerStatus({
        state: 'error',
        lastError: e.message,
        lastRunCompletedAt: new Date().toISOString(),
        lastRunConclusion: 'failure'
      });
      throw e;
    }
    info('Ciclo unico concluido.');
    process.exit(0);
  }

  // Modo intervalo (processo de longa duração): uma falha pontual no primeiro
  // ciclo (ex.: timeout de rede logo ao iniciar) não pode derrubar o processo
  // inteiro — sem isso, o agente ficava parado até o Agendador de Tarefas do
  // Windows disparar um novo processo (até 30 min depois, ou mais se a máquina
  // estava suspensa), em vez de tentar de novo no próximo ciclo do próprio loop.
  try { await runCycle(); }
  catch (e) {
    error('Ciclo falhou:', e.message);
    await publishRunnerStatus({ state: 'error', lastError: e.message, lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'failure' });
  }

  setInterval(async () => {
    try { await runCycle(); }
    catch (e) {
      error('Ciclo falhou:', e.message);
      await publishRunnerStatus({ state: 'error', lastError: e.message, lastRunCompletedAt: new Date().toISOString(), lastRunConclusion: 'failure' });
    }
  }, INTERVAL_MIN * 60 * 1000);
}

main().catch(e => { error('Fatal:', e.message); process.exit(1); });
