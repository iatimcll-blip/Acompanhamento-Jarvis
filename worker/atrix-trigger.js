/*
 * Cloudflare Worker: dispara o ciclo do Agente Atrix (workflow_dispatch em
 * .github/workflows/atrix-sync.yml) a partir de QUALQUER dispositivo, sem exigir um
 * Token do GitHub configurado no navegador de quem clica.
 *
 * Por que existe: painel_jarvis.html vive num repositório GitHub PÚBLICO. Um token com
 * permissão de escrita nunca pode ficar embutido no HTML nem no estado sincronizado
 * (ambos públicos) — isso equivaleria a publicar a senha do repositório pra qualquer
 * pessoa. Este Worker guarda o token real como secret do Cloudflare (nunca visível ao
 * navegador) e só expõe UMA ação fixa: disparar esse workflow específico. Protegido por
 * um segredo compartilhado simples (não é autenticação de usuário real — decisão
 * consciente, ver painel_jarvis.html, comentário perto de ATRIX_WORKER_URL) e por um
 * limite de frequência checado contra o histórico real de execuções do GitHub Actions
 * (não depende de nenhum estado local do navegador, então vale pra todos os dispositivos
 * ao mesmo tempo).
 */

const GH_API = 'https://api.github.com';

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Atrix-Secret',
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function ghHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'atrix-trigger-worker',
    ...extra,
  };
}

async function getLatestRunAgeMinutes(env) {
  const url = `${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.WORKFLOW_FILE}/runs?per_page=1`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (!res.ok) return null; // se a checagem falhar, não bloqueia o disparo
  const data = await res.json();
  const run = (data.workflow_runs || [])[0];
  if (!run || !run.created_at) return null;
  return (Date.now() - new Date(run.created_at).getTime()) / 60000;
}

async function cancelQueuedRuns(env) {
  const url = `${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.WORKFLOW_FILE}/runs?status=queued&per_page=20`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (!res.ok) return;
  const data = await res.json();
  for (const run of data.workflow_runs || []) {
    await fetch(`${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/runs/${run.id}/cancel`, {
      method: 'POST',
      headers: ghHeaders(env),
    }).catch(() => {});
  }
}

async function pushTicketsJson(env, tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return; // nada pra atualizar, mantém o arquivo atual
  const path = env.TICKETS_FILE;
  const getUrl = `${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}?ref=${env.GH_BRANCH}`;
  let sha = null;
  const info = await fetch(getUrl, { headers: ghHeaders(env) });
  if (info.ok) {
    const j = await info.json();
    sha = j.sha || null;
  }
  const putUrl = `${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
  const body = {
    message: `chore: exportar chamados B2B (${tickets.length})`,
    content: utf8ToBase64(JSON.stringify(tickets, null, 2)),
    branch: env.GH_BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: ghHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Falha ao publicar chamados (HTTP ${res.status}): ${errBody}`);
  }
}

async function dispatchWorkflow(env) {
  const url = `${GH_API}/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: ghHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ref: env.GH_BRANCH }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Falha ao disparar o workflow (HTTP ${res.status}): ${errBody}`);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Método não suportado.' }, 405, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'Corpo da requisição inválido.' }, 400, env);
    }

    const secret = request.headers.get('X-Atrix-Secret') || '';
    if (!env.APP_SHARED_SECRET || secret !== env.APP_SHARED_SECRET) {
      return json({ ok: false, error: 'Não autorizado.' }, 403, env);
    }

    const minInterval = Number(env.MIN_INTERVAL_MIN || '30');
    try {
      if (!payload.force) {
        const minsAgo = await getLatestRunAgeMinutes(env);
        if (minsAgo !== null && minsAgo < minInterval) {
          return json({
            ok: false,
            error: 'rate_limited',
            minsAgo: Math.floor(minsAgo),
            minsRemaining: Math.ceil(minInterval - minsAgo),
          }, 409, env);
        }
      }

      await pushTicketsJson(env, payload.tickets);
      await cancelQueuedRuns(env);
      await dispatchWorkflow(env);

      return json({ ok: true }, 200, env);
    } catch (e) {
      return json({ ok: false, error: e.message || 'Erro desconhecido.' }, 500, env);
    }
  },
};
