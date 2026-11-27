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
const HOST_LOGIN = /login\.microsoftonline\.com|login\.live\.com|login\.microsoft\.com/i;
const SEL_FORM = 'input[name="loginfmt"], input[type="password"], #i0116, #i0118';

/* Espera o relatório (contador Total) ou uma tela de login. Passagem rápida pelo login.microsoftonline.com
   (SSO silencioso) não conta: só vale como login se aparecer uma tela de autenticação ou a página
   ficar >8 s no domínio da Microsoft. */
async function aguardarRelatorio(page, ms) {
  const fim = Date.now() + ms; let desde = 0;
  while (Date.now() < fim) {
    if (await page.locator('svg[aria-label^="Total "]').count().catch(() => 0)) return 'ok';
    if (HOST_LOGIN.test(page.url())) {
      if (!desde) desde = Date.now();
      if (Date.now() - desde > 1500 && await page.locator(SEL_FORM + ', #idA_PWD_SwitchToCredPicker, #idSIButton9, #idRichContext_DisplaySign').count().catch(() => 0)) return 'login';
      if (Date.now() - desde > 8000) return 'login';
    } else desde = 0;
    await page.waitForTimeout(700);
  }
  return HOST_LOGIN.test(page.url()) ? 'login' : 'timeout';
}

/* Resolve as telas de autenticação da Microsoft pedindo o Authenticator — e PEDINDO DE NOVO se a
   solicitação falhar. Telas: senha > "Entrar de outra forma"; lista de métodos > Authenticator;
   "A solicitação não foi enviada" > Avançar (reenvia, até 4 envios); número de correspondência (publicado
   via onNumero); "Continuar conectado?" > Sim; escolha de conta. Nunca digita senha nem e-mail. */
async function autenticarPeloAuthenticator(page, onNumero, log) {
  const L = (...a) => { try { (log || console.log)(...a); } catch (_) {} };
  const fim = Date.now() + AUTH_ESPERA_MS + 150000;
  let envios = 0, numeroPublicado = null, ultimaAcao = 0, esperaDesde = 0;
  const texto = () => page.evaluate(() => ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 600)).catch(() => '');
  try {
    while (Date.now() < fim) {
      const u = page.url();
      if (!HOST_LOGIN.test(u)) {
        if (/powerbi\.com/i.test(u)) { L('Authenticator: autenticado, de volta ao Power BI.'); return true; }
        await page.waitForTimeout(1000); continue;
      }
      const t = await texto();
      /* 1) aguardando aprovação no celular (com ou sem número) */
      const numero = await page.evaluate(() => {
        const ok = e => e.offsetParent !== null && /^\s*\d{1,3}\s*$/.test(e.textContent || '');
        const el = [...document.querySelectorAll('[id$="DisplaySign"], .displaySign')].find(ok)
          || [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0).find(ok);
        return el ? el.textContent.trim() : '';
      }).catch(() => '');
      const telaAprovar = /Aprovar entrada|Abra o aplicativo (Microsoft )?Authenticator|aprove a solicitação|Aprovar solicitação|Verifique seu telefone|Approve sign in/i.test(t);
      if (L.ultimoTxt !== t.slice(0, 120)) { L.ultimoTxt = t.slice(0, 120); L('Authenticator: tela = «' + t.slice(0, 120) + '»'); }
      if (numero || telaAprovar) {
        if (!esperaDesde) esperaDesde = Date.now();
        if (numeroPublicado === null || numero !== numeroPublicado) { numeroPublicado = numero; await onNumero(numero); L('Authenticator: aguardando aprovação no celular' + (numero ? ' (número ' + numero + ')' : '') + '.'); }
        if (Date.now() - esperaDesde > AUTH_ESPERA_MS) { L('Authenticator: ninguém aprovou em ' + (AUTH_ESPERA_MS / 60000) + ' min.'); return false; }
        await page.waitForTimeout(1500); continue;
      }
      esperaDesde = 0;
      /* 2) solicitação não enviada / negada / expirada > PEDE DE NOVO (Avançar) */
      if (/A solicitação não foi enviada|Não foi possível enviar uma notificação|solicitação (foi )?negada|solicitação expirou|Sign-in was denied|request wasn't sent/i.test(t)) {
        if (envios >= 5) { L('Authenticator: a Microsoft não enviou/recebeu a solicitação após ' + envios + ' tentativas.'); return false; }
        const av = page.locator('#idSIButton9, #idSubmit_SAOTCAS_Continue, input[type=submit]').first();
        if (await av.count()) { envios++; L('Authenticator: solicitação falhou — pedindo a autenticação de novo (tentativa ' + (envios + 1) + ').'); numeroPublicado = null; await page.waitForTimeout(8000 * envios); await av.click().catch(() => {}); await page.waitForTimeout(2500); continue; }
      }
      /* 3) "Continuar conectado?" > Sim */
      if (await page.locator('#KmsiCheckboxField, #KmsiDescription').count().catch(() => 0)) { await page.locator('#idSIButton9').click().catch(() => {}); L('Authenticator: "Continuar conectado" > Sim.'); await page.waitForTimeout(2000); continue; }
      /* 4) lista de métodos > Authenticator */
      const tile = page.locator('[data-bind*="$parent.tile"]').filter({ hasText: /Microsoft Authenticator/i }).first();
      if (await tile.count() && await tile.isVisible().catch(() => false)) { envios++; L('Authenticator: escolhendo "Aprovar uma solicitação em meu aplicativo Microsoft Authenticator".'); numeroPublicado = null; await tile.click().catch(() => {}); await page.waitForTimeout(2500); continue; }
      /* 5) tela de senha > "Entrar de outra forma" */
      const outra = page.locator('#idA_PWD_SwitchToCredPicker');
      if (await outra.count() && await outra.isVisible().catch(() => false)) { L('Authenticator: tela de senha — escolhendo outra forma de entrar.'); await outra.click().catch(() => {}); await page.waitForTimeout(2500); continue; }
      /* 6) escolha de conta já conhecida (nunca digita nada) */
      const conta = page.locator('[data-test-id*="@"], #tilesHolder [role=button]').filter({ hasText: /@/ }).first();
      if (await conta.count() && Date.now() - ultimaAcao > 5000) { ultimaAcao = Date.now(); await conta.click().catch(() => {}); await page.waitForTimeout(2500); continue; }
      await page.waitForTimeout(1500);
    }
    L('Authenticator: tempo esgotado na tela de login.');
    return false;
  } catch (e) { L('Authenticator: não foi possível usar (' + e.message + ').'); return false; }
}

module.exports = { NUVEM_FILE, hashSessao, marcaNuvemExpirada, saidaFallback, vigiaVivo, pedirLoginNoPC, autenticarPeloAuthenticator, aguardarRelatorio, AUTH_ESPERA_MS };
