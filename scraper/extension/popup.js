'use strict';

const dot        = document.getElementById('dot');
const elSync     = document.getElementById('lastSync');
const elResult   = document.getElementById('lastResult');
const btnSync    = document.getElementById('btnSync');

function fmtISO(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return '—'; }
}

function applyStatus(data) {
  elSync.textContent   = fmtISO(data?.lastSync);
  elResult.textContent = data?.lastResult || '—';

  const isRunning = !!data?.running;
  dot.className        = 'dot' + (isRunning ? ' running' : '');
  btnSync.disabled     = isRunning;
  btnSync.textContent  = isRunning ? '⟳ Sincronizando...' : '⟳ Sincronizar Agora';
}

// Carregar status ao abrir o popup
chrome.runtime.sendMessage({ action: 'status' }, applyStatus);

// Botão sincronizar
btnSync.addEventListener('click', () => {
  applyStatus({ running: true, lastSync: null, lastResult: 'Iniciando...' });
  chrome.runtime.sendMessage({ action: 'sync' }, () => {
    chrome.runtime.sendMessage({ action: 'status' }, applyStatus);
  });
});
