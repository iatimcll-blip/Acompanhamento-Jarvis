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

/* 3) Pedido do usuário (2026-11-26): quando a Microsoft pedir para autenticar, solicitar o
 *    AUTHENTICATOR em vez da senha. Na tela "Insira a senha" o agente clica em "Entrar de outra
 *    forma" › "Aprovar uma solicitação em meu aplicativo Microsoft Authenticator", lê o número que
 *    aparece (correspondência de números) e o publica no status — o painel mostra o número e a
 *    pessoa aprova no celular. Nunca digita senha nem e-mail. Se ninguém aprovar em
 *    AUTH_ESPERA_MS, devolve false (o agente segue o caminho antigo: login vencido).
 *    onNumero(numero|'') é chamado quando o pedido é enviado ao celular. */
const AUTH_ESPERA_MS = 4 * 60000;
async function autenticarPeloAuthenticator(page, onNumero, log) {
  const L = (...a) => { try { (log || console.log)(...a); } catch (_) {} };
  try {
    const outra = page.locator('#idA_PWD_SwitchToCredPicker');
    if (!(await outra.count())) { L('Authenticator: tela sem "Entrar de outra forma" (não é a tela de senha da conta).'); return false; }
    await outra.click();
    const tile = page.locator('[data-bind*="$parent.tile"]').filter({ hasText: /Microsoft Authenticator/i }).first();
    await tile.waitFor({ state: 'visible', timeout: 20000 });
    await tile.click();
    L('Authenticator: pedido de aprovação enviado ao celular.');
    /* número da correspondência (ids conhecidos da Microsoft; se não houver, aprova sem número) */
    let numero = '';
    for (let i = 0; i < 20 && !numero; i++) {
      numero = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[id$="DisplaySign"], .displaySign, #idRemoteNGC_DisplaySign, #idRichContext_DisplaySign')]
          .find(e => e.offsetParent !== null && /^\s*\d{1,3}\s*$/.test(e.textContent || ''));
        return el ? el.textContent.trim() : '';
      }).catch(() => '');
      if (!numero) await page.waitForTimeout(500);
    }
    await onNumero(numero);
    /* espera a aprovação: volta ao Power BI; "Continuar conectado?" → Sim (mantém a sessão) */
    const fim = Date.now() + AUTH_ESPERA_MS;
    while (Date.now() < fim) {
      const u = page.url();
      if (/app\.powerbi\.com/.test(u) && !/login|singleSignOn/i.test(u)) { L('Authenticator: aprovado.'); return true; }
      if (await page.locator('#KmsiCheckboxField, #KmsiDescription').count().catch(() => 0)) {
        await page.locator('#idSIButton9').click().catch(() => {});
        L('Authenticator: "Continuar conectado" → Sim.');
      }
      const recusado = await page.locator('#idDiv_SAASDS_Title, #idDiv_SAOTCAS_Title, #idTD_Error').filter({ hasText: /negad|recus|não foi aprovad|expirou|denied/i }).count().catch(() => 0);
      if (recusado) { L('Authenticator: pedido recusado ou expirado no celular.'); return false; }
      await page.waitForTimeout(1500);
    }
    L('Authenticator: ninguém aprovou em ' + (AUTH_ESPERA_MS / 60000) + ' min.');
    return false;
  } catch (e) { L('Authenticator: não foi possível usar (' + e.message + ').'); return false; }
}

module.exports = { NUVEM_FILE, hashSessao, marcaNuvemExpirada, saidaFallback, vigiaVivo, pedirLoginNoPC, autenticarPeloAuthenticator, AUTH_ESPERA_MS };
