'use strict';

// ── Token GitHub (XOR key=42, nunca em plaintext) ─────────────────────────────
const _T = [77,66,90,117,64,71,93,109,127,107,104,91,89,102,29,68,69,65,105,75,
            123,99,72,64,124,112,108,123,125,100,103,127,104,19,26,96,68,71,107,111];
const GH_TOKEN  = _T.map(b => String.fromCharCode(b ^ 42)).join('');
const GH_REPO   = 'iatimcll-blip/Acompanhamento-Jarvis';
const GH_BRANCH = 'main';

// ── Registro de alarme ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('atrix-sync', { periodInMinutes: 30 });
});

// Recriar alarme se o service worker foi reiniciado e o alarme sumiu
chrome.alarms.get('atrix-sync', alarm => {
  if (!alarm) chrome.alarms.create('atrix-sync', { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'atrix-sync') runSync();
});

// ── Mensagens do popup ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.action === 'sync') {
    runSync().then(() => reply({ ok: true })).catch(e => reply({ error: e.message }));
    return true;
  }
  if (msg.action === 'status') {
    chrome.storage.local.get(['lastSync', 'lastResult', 'running'], reply);
    return true;
  }
});

// ── GitHub helpers ────────────────────────────────────────────────────────────
async function ghGet(path) {
  const r = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}&t=${Date.now()}`,
    { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (r.status === 404) return { content: null, sha: null };
  const j = await r.json();
  return { content: atob(j.content.replace(/\n/g, '')), sha: j.sha };
}

async function ghPut(path, content, sha, msg) {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: msg, content: encoded, branch: GH_BRANCH, ...(sha ? { sha } : {}) })
  });
}

// ── Extrair substatus de um tab (aguarda SPA renderizar) ─────────────────────
function extractFromTab(tabId) {
  return new Promise(resolve => {
    let tries = 18;
    function attempt() {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            // Verificar se está na tela de login
            if (document.querySelector('input[type="password"]')) return '__login__';
            const selects = [...document.querySelectorAll('select')];
            if (selects.length < 2) return '__wait__';
            const sub = selects[1];
            const txt = sub.options[sub.selectedIndex]?.text?.trim();
            return txt && txt.length > 0 ? txt : '__wait__';
          }
        },
        results => {
          const val = results?.[0]?.result;
          if (!val || val === '__wait__') {
            if (tries-- > 0) setTimeout(attempt, 800);
            else resolve(null);
          } else if (val === '__login__') {
            resolve('__login__');
          } else {
            resolve(val);
          }
        }
      );
    }
    setTimeout(attempt, 2000); // aguarda SPA inicial
  });
}

// ── Navegar tab e aguardar carregamento ───────────────────────────────────────
function navigateTab(tabId, url) {
  return new Promise(resolve => {
    function onUpdated(tid, info) {
      if (tid === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId, { url });
  });
}

// ── Ciclo principal ───────────────────────────────────────────────────────────
async function runSync() {
  const { running } = await chrome.storage.local.get('running');
  if (running) { console.log('[Jarvis] Sync já em andamento, pulando.'); return; }

  await chrome.storage.local.set({ running: true });
  const startedAt = new Date();
  console.log(`[Jarvis] Iniciando sync em ${startedAt.toLocaleTimeString('pt-BR')}`);

  let tab = null;
  try {
    const { content: tJson } = await ghGet('data/atrix_tickets.json');
    if (!tJson) throw new Error('atrix_tickets.json não encontrado. Exporte p/ Agente no painel.');

    const tickets = JSON.parse(tJson).filter(t => t.link);
    const { content: uJson, sha } = await ghGet('data/atrix_updates.json');
    const updates = uJson ? JSON.parse(uJson) : {};

    // Abrir aba invisível no Atrix base (já logado)
    tab = await new Promise(resolve => chrome.tabs.create({ url: 'https://atrix.mobtelecom.com.br/controle/', active: false }, resolve));
    await new Promise(r => setTimeout(r, 2500));

    let changed = 0, errors = 0, loginRequired = false;

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const tid = ticket.id || ticket.ticketId || '';

      await navigateTab(tab.id, ticket.link);
      const sub = await extractFromTab(tab.id);

      if (sub === '__login__') {
        loginRequired = true;
        console.log('[Jarvis] Sessão Atrix expirada. Faça login e sincronize novamente.');
        break;
      }

      if (sub) {
        const old = (updates[tid] || {}).substatus;
        updates[tid] = { substatus: sub, cliente: ticket.cliente || '', updatedAt: new Date().toISOString() };
        if (sub !== old) { changed++; console.log(`[Jarvis] ${tid}: "${old}" → "${sub}"`); }
      } else {
        errors++;
      }

      if (i < tickets.length - 1) await new Promise(r => setTimeout(r, 400));
    }

    if (tab) { chrome.tabs.remove(tab.id); tab = null; }

    if (loginRequired) {
      await chrome.storage.local.set({ lastResult: 'Sessão expirada — faça login no Atrix', running: false });
      chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'Jarvis Atrix', message: 'Sessão expirada. Faça login no Atrix e clique Sincronizar.' });
      return;
    }

    if (changed > 0 || !sha) {
      await ghPut('data/atrix_updates.json', JSON.stringify(updates, null, 2), sha,
        `chore: substatus Atrix [${changed}/${tickets.length}]`);
    }

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const ts  = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const result = `${ts} — ${changed}/${tickets.length} alterados${errors ? ` (${errors} falhas)` : ''}`;

    await chrome.storage.local.set({ lastSync: now.toISOString(), lastResult: result, running: false });
    console.log(`[Jarvis] Sync concluído: ${result}`);

  } catch (e) {
    if (tab) { try { chrome.tabs.remove(tab.id); } catch {} }
    const err = `Erro: ${e.message}`;
    await chrome.storage.local.set({ lastResult: err, running: false });
    console.error('[Jarvis]', err);
  }
}
