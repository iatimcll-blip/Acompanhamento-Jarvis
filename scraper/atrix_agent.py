"""
Jarvis — Agente de atualização automática de substatus via Atrix.

Fluxo:
  1. Lê data/atrix_tickets.json do GitHub (lista de chamados B2B abertos com links)
  2. Faz login no Atrix (usuário/senha via .env)
  3. Para cada chamado, acessa o link e extrai o valor do dropdown de substatus
  4. Escreve data/atrix_updates.json no GitHub
  5. O painel lê esse JSON e aplica os substatuses automaticamente

Execução: python atrix_agent.py
Agendamento automático: a cada 30 minutos (configurável via INTERVAL_MINUTES no .env)
"""

import os
import json
import time
import base64
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
import schedule
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page, TimeoutError as PwTimeout

# ─── Configuração ────────────────────────────────────────────────────────────

load_dotenv()

ATRIX_BASE_URL   = os.getenv('ATRIX_BASE_URL',  'https://atrix.mobtelecom.com.br/controle/')
ATRIX_USER       = os.getenv('ATRIX_USER', '')
ATRIX_PASS       = os.getenv('ATRIX_PASS', '')
ATRIX_SUB_SEL    = os.getenv('ATRIX_SUBSTATUS_SELECTOR', '')   # override manual, ex: "select#substatus"

GH_TOKEN         = os.getenv('GITHUB_TOKEN', '')
GH_REPO          = os.getenv('GITHUB_REPO',  'iatimcll-blip/Acompanhamento-Jarvis')
GH_BRANCH        = os.getenv('GITHUB_BRANCH', 'main')
GH_TICKETS_FILE  = 'data/atrix_tickets.json'
GH_UPDATES_FILE  = 'data/atrix_updates.json'
GH_API           = f'https://api.github.com/repos/{GH_REPO}/contents/'

INTERVAL_MIN     = int(os.getenv('INTERVAL_MINUTES', '30'))
DELAY_S          = float(os.getenv('DELAY_SECONDS', '2'))
DEBUG            = os.getenv('DEBUG', '').lower() in ('1', 'true', 'yes')
HEADLESS         = not DEBUG

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('atrix_agent.log', encoding='utf-8'),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger('atrix-agent')

# ─── GitHub helpers ──────────────────────────────────────────────────────────

def _gh_headers() -> dict:
    return {
        'Authorization': f'token {GH_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }


def gh_get_file(path: str) -> tuple[str | None, str | None]:
    """Retorna (conteúdo_str, sha) ou (None, None) se não existir."""
    r = requests.get(
        GH_API + path,
        headers=_gh_headers(),
        params={'ref': GH_BRANCH, 't': int(time.time())},
        timeout=20,
    )
    if r.status_code == 404:
        return None, None
    r.raise_for_status()
    j = r.json()
    content = base64.b64decode(j['content'].replace('\n', '')).decode('utf-8')
    return content, j.get('sha', '')


def gh_put_file(path: str, content_str: str, sha: str | None, message: str) -> None:
    encoded = base64.b64encode(content_str.encode('utf-8')).decode('ascii')
    body: dict = {'message': message, 'content': encoded, 'branch': GH_BRANCH}
    if sha:
        body['sha'] = sha
    r = requests.put(GH_API + path, headers=_gh_headers(), json=body, timeout=30)
    r.raise_for_status()

# ─── Leitura / gravação de estado ────────────────────────────────────────────

def load_tickets() -> list[dict]:
    content, _ = gh_get_file(GH_TICKETS_FILE)
    if not content:
        log.warning(
            'data/atrix_tickets.json não encontrado no GitHub.\n'
            '→ Abra o painel e clique em "Exportar p/ Agente" no painel B2B Abertos.'
        )
        return []
    tickets = json.loads(content)
    with_link = [t for t in tickets if t.get('link')]
    log.info(f'{len(with_link)} chamados com link carregados (total: {len(tickets)}).')
    return with_link


def load_updates() -> tuple[dict, str | None]:
    content, sha = gh_get_file(GH_UPDATES_FILE)
    return (json.loads(content) if content else {}), sha


def save_updates(updates: dict, sha: str | None) -> None:
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    gh_put_file(
        GH_UPDATES_FILE,
        json.dumps(updates, ensure_ascii=False, indent=2),
        sha=sha,
        message=f'chore: substatus Atrix ({ts}) [{len(updates)} chamados]',
    )
    log.info(f'atrix_updates.json salvo no GitHub ({len(updates)} chamados).')

# ─── Login Atrix ─────────────────────────────────────────────────────────────

def login_atrix(page: Page) -> bool:
    log.info('Acessando Atrix...')
    page.goto(ATRIX_BASE_URL, wait_until='domcontentloaded', timeout=30_000)
    page.wait_for_timeout(1500)

    # Se já logado, o painel carregará sem formulário de login
    if not page.query_selector('input[type="password"]'):
        log.info('Sessão já ativa no Atrix.')
        return True

    try:
        user_sel = ('input[name="username"], input[name="email"], '
                    'input[id*="user"], input[id*="email"]')
        pass_sel = 'input[type="password"]'

        page.wait_for_selector(user_sel, timeout=8_000)
        page.fill(user_sel, ATRIX_USER)
        page.fill(pass_sel, ATRIX_PASS)
        page.click('input[type="submit"], button[type="submit"]')
        page.wait_for_load_state('domcontentloaded', timeout=15_000)
        page.wait_for_timeout(1500)

        if page.query_selector('input[type="password"]'):
            log.error('Login falhou. Verifique ATRIX_USER e ATRIX_PASS no arquivo .env')
            return False

        log.info('Login no Atrix realizado.')
        return True
    except Exception as exc:
        log.error(f'Erro no login: {exc}')
        return False

# ─── Extração de substatus ───────────────────────────────────────────────────

# Seletores tentados em ordem para encontrar o dropdown de substatus
_SUB_SELECTORS = [
    'select[name="substatus"]',
    'select[name="sub_status"]',
    'select[id="substatus"]',
    'select[id*="substatus"]',
    'select[name*="substatus"]',
    'select[class*="substatus"]',
    # seletores de status genérico como fallback
    'select[name="status"]',
    'select[id="status"]',
]


def _select_value(page: Page, selector: str) -> str | None:
    el = page.query_selector(selector)
    if not el:
        return None
    val: str = el.evaluate(
        'el => el.options[el.selectedIndex] ? el.options[el.selectedIndex].text.trim() : ""'
    )
    return val or None


def extract_substatus(page: Page, ticket: dict) -> str | None:
    link      = ticket['link']
    ticket_id = ticket.get('id') or ticket.get('ticketId', '?')

    try:
        page.goto(link, wait_until='domcontentloaded', timeout=30_000)

        # SPA com hash routing — aguarda os selects serem renderizados pelo JS.
        # Sem isso, o DOM pode estar vazio quando tentamos extrair.
        try:
            page.wait_for_selector('select', timeout=15_000)
        except PwTimeout:
            log.warning(f'[{ticket_id}] SPA não renderizou selects em 15s.')
            return None

        # Seletor manual via .env (override)
        if ATRIX_SUB_SEL:
            val = _select_value(page, ATRIX_SUB_SEL)
            if val:
                return val
            log.debug(f'[{ticket_id}] Override "{ATRIX_SUB_SEL}" sem valor.')

        # 1. Tentativa pelos atributos name/id
        for sel in _SUB_SELECTORS:
            val = _select_value(page, sel)
            if val:
                log.debug(f'[{ticket_id}] substatus via "{sel}": {val!r}')
                return val

        # 2. Busca JavaScript: label "Substatus *" → select adjacente;
        #    fallback: 2º select da página (Status=1º, Substatus=2º conforme layout Atrix)
        val = page.evaluate('''() => {
            function selText(el) {
                if (!el || el.tagName !== "SELECT") return null;
                const opt = el.options[el.selectedIndex];
                return opt ? opt.text.trim() : null;
            }
            // Label "Substatus *" → select vinculado
            for (const lbl of document.querySelectorAll("label")) {
                if (!lbl.textContent.toLowerCase().includes("substatus")) continue;
                const forId = lbl.getAttribute("for");
                let el = forId ? document.getElementById(forId) : null;
                if (!el) el = lbl.nextElementSibling;
                if (!el) el = lbl.closest("div, td, th")
                               ? lbl.closest("div, td, th").querySelector("select")
                               : null;
                const v = selText(el);
                if (v) return v;
            }
            // Fallback posicional: 2º select = Substatus (1º = Status)
            const selects = [...document.querySelectorAll("select")];
            if (selects.length >= 2) return selText(selects[1]);
            return null;
        }''')
        if val:
            log.debug(f'[{ticket_id}] substatus via JS: {val!r}')
            return val

        # Debug: screenshot para inspeção manual do layout real
        if DEBUG:
            shot = Path(f'debug_{ticket_id}.png')
            page.screenshot(path=str(shot), full_page=True)
            log.debug(
                f'[{ticket_id}] Screenshot salvo em {shot}.\n'
                f'  Inspecione o HTML e defina ATRIX_SUBSTATUS_SELECTOR no .env'
            )
        else:
            log.warning(f'[{ticket_id}] Substatus não encontrado em {link}')

        return None

    except PwTimeout:
        log.warning(f'[{ticket_id}] Timeout ao carregar {link}')
        return None
    except Exception as exc:
        log.error(f'[{ticket_id}] Erro: {exc}')
        return None

# ─── Ciclo principal ─────────────────────────────────────────────────────────

def run_cycle() -> None:
    log.info('══════ Iniciando ciclo de atualização ══════')

    if not ATRIX_USER or not ATRIX_PASS:
        log.error('ATRIX_USER / ATRIX_PASS não configurados no .env. Abortando.')
        return
    if not GH_TOKEN:
        log.error('GITHUB_TOKEN não configurado no .env. Abortando.')
        return

    tickets = load_tickets()
    if not tickets:
        return

    updates, sha = load_updates()
    changed = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=HEADLESS)
        ctx = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            )
        )
        page = ctx.new_page()

        if not login_atrix(page):
            browser.close()
            return

        for i, ticket in enumerate(tickets, 1):
            tid = ticket.get('id') or ticket.get('ticketId', '')
            log.info(f'[{i}/{len(tickets)}] Verificando chamado {tid}...')

            old = updates.get(tid, {}).get('substatus', '')
            new = extract_substatus(page, ticket)

            if new:
                updates[tid] = {
                    'substatus': new,
                    'cliente':   ticket.get('cliente', ''),
                    'updatedAt': datetime.now(timezone.utc).isoformat(),
                }
                if new != old:
                    log.info(f'  ✓ {old!r} → {new!r}')
                    changed += 1
                else:
                    log.debug(f'  – sem mudança ({new!r})')

            if i < len(tickets):
                time.sleep(DELAY_S)

        browser.close()

    if changed > 0 or not sha:
        save_updates(updates, sha)
    else:
        log.info('Nenhuma mudança detectada — GitHub não atualizado.')

    log.info(f'══════ Ciclo concluído: {changed}/{len(tickets)} chamados alterados ══════')


def main() -> None:
    log.info(f'Jarvis Atrix Agent iniciado. Intervalo: {INTERVAL_MIN} min.')
    run_cycle()
    schedule.every(INTERVAL_MIN).minutes.do(run_cycle)
    while True:
        schedule.run_pending()
        time.sleep(15)


if __name__ == '__main__':
    main()
