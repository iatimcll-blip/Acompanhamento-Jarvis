/* Partes comuns dos agentes do BI (pbi_export.js e pbi_enc_export.js) — 2026-11-26.
 *
 * 1) Sessão da NUVEM vencida: o agente na nuvem grava em data/pbi-nuvem.json só um resumo (hash
 *    sha256 truncado) do secret PBI_SESSION que venceu. O job "onde" do workflow compara com o
 *    secret atual e pula a nuvem enquanto for o mesmo secret (vai direto ao PC, ~1,5 min a menos
 *    e sem a rodada marcada como "falha"). Quando o secret é regravado, o hash muda e a nuvem volta.
 *
 * 2) Login vencido no PC: a Microsoft pede a senha de novo a cada ~12 h (regra da conta; o PC não
 *    é ligado ao Azure AD, então não há login silencioso). O agente (serviço do runner, sem tela)
 *    deixa um pedido em <AUTH_DIR>/precisa-login-<alvo>.json; o vigia (pbi_login_vigia.js, roda na
 *    sessão do usuário) abre a janela de login sozinho e, depois do login, dispara o BI de novo.
 *    O agente NUNCA digita credenciais — quem entra na conta é a pessoa, na janela.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NUVEM_FILE = 'data/pbi-nuvem.json';

function hashSessao(s) {
  return crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
}

/* conteúdo de data/pbi-nuvem.json (sem nada da sessão em si) */
function marcaNuvemExpirada() {
  return { expiradaHash: hashSessao(process.env.PBI_SESSION), em: new Date().toISOString() };
}

/* job "nuvem": avisa o workflow que o PC deve assumir (sem marcar a rodada como falha) */
function saidaFallback() {
  try { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'fallback=true\n'); } catch (_) {}
}

/* vigia vivo = gravou o batimento há menos de 90 s */
function vigiaVivo(authDir) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(authDir, 'vigia.json'), 'utf8'));
    return Date.now() - new Date(v.at).getTime() < 90000;
  } catch (_) { return false; }
}

/* deixa o pedido de login para o vigia; devolve true se o vigia está rodando para atender */
function pedirLoginNoPC(authDir, alvo) {
  try {
    fs.writeFileSync(path.join(authDir, 'precisa-login-' + alvo + '.json'), JSON.stringify({ alvo, at: new Date().toISOString() }));
  } catch (_) { return false; }
  return vigiaVivo(authDir);
}

module.exports = { NUVEM_FILE, hashSessao, marcaNuvemExpirada, saidaFallback, vigiaVivo, pedirLoginNoPC };
