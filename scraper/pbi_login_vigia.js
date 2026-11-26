/* Vigia do login do Power BI (2026-11-26) — roda na SESSÃO DO USUÁRIO do PC principal (inicia com o
 * Windows, oculto). O agente do BI roda como serviço (sem tela) e, quando a Microsoft pede a senha de
 * novo, deixa um pedido em <AUTH_DIR>/precisa-login-<ab|enc>.json (ver pbi_comum.js).
 *
 * O vigia então:
 *   1. abre sozinho a janela "Login Power BI" (pbi_export.js --login) — a pessoa só entra na conta;
 *   2. depois do login, dispara de novo o BI que tinha falhado (gh workflow run), sem precisar clicar.
 * Cada pedido é atendido UMA vez: se a janela for fechada ou o login não for feito em 10 min, não
 * reabre em loop — o próximo clique em BI gera um pedido novo. Nunca digita credenciais.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const AUTH_DIR = process.env.PBI_AUTH_DIR || 'D:\\JarvisRunner\\pbi-auth';
const SCRAPER = process.env.PBI_SCRAPER_DIR || 'D:\\JarvisRunner\\_work\\Acompanhamento-Jarvis\\Acompanhamento-Jarvis\\scraper';
const REPO = 'iatimcll-blip/Acompanhamento-Jarvis';
const WORKFLOWS = { ab: 'pbi-sync.yml', enc: 'pbi-enc-sync.yml' };
const GH = process.env.PBI_VIGIA_GH || ['C:\\Program Files\\GitHub CLI\\gh.exe', 'C:\\Program Files (x86)\\GitHub CLI\\gh.exe'].find(p => fs.existsSync(p)) || 'gh';
const ATENDIDOS = path.join(AUTH_DIR, 'vigia-atendidos.json');
const LOG = path.join(AUTH_DIR, 'vigia.log');
const VALIDADE_PEDIDO_MS = 2 * 3600000; // pedido mais velho que 2 h (PC estava desligado) é ignorado

function log(...a) {
  const linha = new Date().toLocaleString('pt-BR') + ' ' + a.join(' ');
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 512 * 1024) fs.renameSync(LOG, LOG + '.1');
    fs.appendFileSync(LOG, linha + '\n');
  } catch (_) {}
  console.log(linha);
}
const lerJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return def; } };

let logando = false;

function batimento() {
  try { fs.writeFileSync(path.join(AUTH_DIR, 'vigia.json'), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, logando })); } catch (_) {}
}

function pedidosPendentes() {
  const atend = lerJson(ATENDIDOS, {});
  const out = [];
  for (const alvo of Object.keys(WORKFLOWS)) {
    const p = lerJson(path.join(AUTH_DIR, 'precisa-login-' + alvo + '.json'), null);
    if (!p || !p.at) continue;
    if (atend[alvo] && atend[alvo] >= p.at) continue;
    if (Date.now() - new Date(p.at).getTime() > VALIDADE_PEDIDO_MS) continue;
    out.push({ alvo, at: p.at });
  }
  return out;
}

function rodar(cmd, args, env) {
  return new Promise(resolve => {
    const ch = spawn(cmd, args, { env: Object.assign({}, process.env, env || {}), windowsHide: true });
    let saida = '';
    ch.stdout.on('data', d => (saida += d));
    ch.stderr.on('data', d => (saida += d));
    ch.on('error', e => resolve({ code: -1, saida: e.message }));
    ch.on('close', code => resolve({ code, saida }));
  });
}

async function atender(pend) {
  logando = true; batimento();
  const atend = lerJson(ATENDIDOS, {});
  for (const p of pend) atend[p.alvo] = p.at;
  try { fs.writeFileSync(ATENDIDOS, JSON.stringify(atend)); } catch (_) {}
  log('Login do Power BI vencido (' + pend.map(p => p.alvo).join(', ') + ') — abrindo a janela de login.');
  const r = await rodar(process.execPath, [path.join(SCRAPER, 'pbi_export.js'), '--login'],
    { NODE_PATH: path.join(SCRAPER, 'node_modules'), PBI_AUTH_DIR: AUTH_DIR });
  if (r.code !== 0) {
    log('Login não concluído (janela fechada ou 10 min sem entrar). Nada disparado.', String(r.saida).split('\n').filter(Boolean).slice(-2).join(' | '));
    logando = false; batimento();
    return;
  }
  log('Login feito. Disparando o BI de novo:', pend.map(p => WORKFLOWS[p.alvo]).join(', '));
  for (const p of pend) {
    const d = await rodar(GH, ['workflow', 'run', WORKFLOWS[p.alvo], '-R', REPO, '--ref', 'main']);
    log(WORKFLOWS[p.alvo], d.code === 0 ? 'disparado.' : 'NÃO disparado: ' + String(d.saida).trim().slice(0, 200));
  }
  logando = false; batimento();
}

function ciclo() {
  batimento();
  if (logando) return;
  const pend = pedidosPendentes();
  if (pend.length) atender(pend).catch(e => { log('erro:', e.message); logando = false; });
}

/* uma instância só (porta local como trava) */
const trava = net.createServer();
trava.once('error', () => { console.log('Vigia já está rodando.'); process.exit(0); });
trava.listen(8791, '127.0.0.1', () => {
  try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (_) {}
  log('Vigia do login do Power BI iniciado (pid ' + process.pid + ').');
  /* pedidos que já existiam quando o vigia ligou (ex.: PC reiniciado) não abrem janela de surpresa */
  const atend = lerJson(ATENDIDOS, {});
  for (const alvo of Object.keys(WORKFLOWS)) {
    const p = lerJson(path.join(AUTH_DIR, 'precisa-login-' + alvo + '.json'), null);
    if (p && p.at && !(atend[alvo] >= p.at)) atend[alvo] = p.at;
  }
  try { fs.writeFileSync(ATENDIDOS, JSON.stringify(atend)); } catch (_) {}
  ciclo();
  setInterval(ciclo, 10000);
});
