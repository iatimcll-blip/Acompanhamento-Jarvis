
const LS_TICKETS_KEY = 'auditMaterial.tickets.v1';
const LS_CATALOG_KEY = 'auditMaterial.catalog.v1';

function saveTicketsLS(){
  try{ localStorage.setItem(LS_TICKETS_KEY, JSON.stringify(TICKETS)); }catch(e){}
}
function saveCatalogLS(){
  try{ localStorage.setItem(LS_CATALOG_KEY, JSON.stringify(CATALOG)); }catch(e){}
}

(function initTickets(){
  let restored = null;
  try{
    const raw = localStorage.getItem(LS_TICKETS_KEY);
    if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) restored = arr; }
  }catch(e){}
  if(restored){
    TICKETS.length = 0;
    restored.forEach(t=>TICKETS.push(t));
  }
  TICKETS.forEach((t,i)=>{
    t._id = i;
    if(!Array.isArray(t.mats)) t.mats = [];
    if(typeof t.classificacao !== 'string') t.classificacao = '';
    if(typeof t.obs !== 'string') t.obs = '';
  });
  if(!restored) saveTicketsLS();
})();

(function initCatalog(){
  try{
    const raw = localStorage.getItem(LS_CATALOG_KEY);
    if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) CATALOG = arr; }
  }catch(e){}
})();

let selectedItem = null;
let currentTicketId = null;
let filterText = '';
let filterMat = 'todos';

function normalize(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function updateKpis(visible){
  document.getElementById('kpiTotal').textContent = TICKETS.length;
  document.getElementById('kpiTec').textContent = new Set(TICKETS.map(t=>t.tecnico).filter(Boolean)).size;
  document.getElementById('kpiCid').textContent = new Set(TICKETS.map(t=>t.cidade).filter(Boolean)).size;
  const comMat = TICKETS.filter(t=>t.mats.length>0).length;
  document.getElementById('kpiMat').textContent = comMat + ' / ' + TICKETS.length;
}

function ticketMatches(t){
  const q = normalize(filterText);
  const hit = !q || [t.os, t.cliente, t.tecnico, t.cidade, t.idOs].some(v=>normalize(v).includes(q));
  if(!hit) return false;
  if(filterMat === 'com') return t.mats.length>0;
  if(filterMat === 'sem') return t.mats.length===0;
  return true;
}

const CLASSIFICACOES = ['INFRA','REDE','FIELD','B2B','SWAP','B2C','CHAM. PREVENTIVO'];

function escapeAttr(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function majorityGroup(mats){
  const counts = {};
  const order = [];
  mats.forEach(m=>{
    if(!m.grupo) return;
    if(!(m.grupo in counts)){ counts[m.grupo] = 0; order.push(m.grupo); }
    counts[m.grupo]++;
  });
  if(order.length===0) return null;
  let best = order[0];
  order.forEach(g=>{ if(counts[g]>counts[best]) best = g; });
  return best;
}

function isDivergentMat(mats, m){
  if(!m.grupo) return false;
  const distinctGroups = new Set(mats.map(x=>x.grupo).filter(Boolean));
  if(distinctGroups.size<=1) return false;
  const majority = majorityGroup(mats);
  return !!majority && m.grupo !== majority;
}

function matWarnIcon(mats, m){
  return isDivergentMat(mats, m)
    ? ' <span class="mat-warn-icon" title="Grupo \''+escapeAttr(m.grupo)+'\' diferente dos demais materiais deste chamado">⚠️</span>'
    : '';
}

function renderTable(){
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  const visible = TICKETS.filter(ticketMatches);
  visible.forEach(t=>{
    const tr = document.createElement('tr');
    if(t.mats.length>0) tr.classList.add('row-has-mat');
    else if((t.obs||'').trim()) tr.classList.add('row-has-obs');
    const matHtml = t.mats.length
      ? t.mats.map(m=>'<span class="badge">'+(m.cod||'—')+' — '+m.desc+' ('+m.qtd+')'+(m.manual?' <em>manual</em>':'')+matWarnIcon(t.mats,m)+'</span>').join('')
        + '<br><button class="btn-add-mat" data-id="'+t._id+'" style="margin-top:4px;">Editar</button>'
      : '<span class="pill-empty">Nenhum material lançado</span>'
        + '<button class="btn-add-mat" data-id="'+t._id+'">+ Materiais</button>';
    const clsHtml = '<select class="cls-select" data-id="'+t._id+'">'
      + '<option value=""'+(t.classificacao?'':' selected')+'>— Selecionar —</option>'
      + CLASSIFICACOES.map(c=>'<option value="'+c+'"'+(t.classificacao===c?' selected':'')+'>'+c+'</option>').join('')
      + '</select>';
    const obsHtml = '<input type="text" class="obs-input" data-id="'+t._id+'" value="'+escapeAttr(t.obs)+'" placeholder="Observações...">';
    tr.innerHTML =
      '<td>'+t.data+'</td>'+
      '<td>'+t.os+'</td>'+
      '<td>'+t.cliente+'</td>'+
      '<td>'+t.cidade+(t.uf?('/'+t.uf):'')+'</td>'+
      '<td>'+t.tecnico+'</td>'+
      '<td>'+t.tipo+'</td>'+
      '<td>'+clsHtml+'</td>'+
      '<td>'+obsHtml+'</td>'+
      '<td>'+matHtml+'</td>';
    tbody.appendChild(tr);
  });
  document.querySelectorAll('.btn-add-mat').forEach(b=>{
    b.addEventListener('click', ()=>openModal(parseInt(b.dataset.id)));
  });
  document.querySelectorAll('.cls-select').forEach(sel=>{
    sel.addEventListener('change', (e)=>{
      TICKETS[parseInt(sel.dataset.id)].classificacao = e.target.value;
      saveTicketsLS();
    });
  });
  document.querySelectorAll('.obs-input').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const t = TICKETS[parseInt(inp.dataset.id)];
      t.obs = e.target.value;
      saveTicketsLS();
      const tr = inp.closest('tr');
      if(tr && t.mats.length===0){
        tr.classList.toggle('row-has-obs', !!t.obs.trim());
      }
    });
  });
  document.getElementById('countInfo').textContent =
    'Exibindo '+visible.length+' de '+TICKETS.length+' chamados concluídos.';
  updateKpis();
}

function openModal(id){
  currentTicketId = id;
  const t = TICKETS[id];
  document.getElementById('modalSub').textContent = t.os + ' — ' + t.cliente;
  document.getElementById('acInput').value = '';
  document.getElementById('codBox').value = '';
  document.getElementById('acList').classList.remove('open');
  document.getElementById('codAcList').classList.remove('open');
  document.getElementById('qtdInput').value = 1;
  document.getElementById('modalErr').style.display = 'none';
  document.getElementById('manualMode').checked = false;
  setManualMode(false);
  selectedItem = null;
  renderMatLines();
  document.getElementById('modalOverlay').classList.add('open');
}

function setManualMode(on){
  document.getElementById('labelDesc').textContent = on ? 'Descrição do material (manual)' : 'Descrição do material';
  document.getElementById('acInput').placeholder = on
    ? 'Digite a descrição do material não catalogado...'
    : 'Digite para buscar: splitter, conector, CABO OPTICO...';
  document.getElementById('labelCod').textContent = on ? 'Código SAP (opcional)' : 'Código SAP';
  document.getElementById('codBox').placeholder = on
    ? 'Deixe em branco se não houver código'
    : 'Digite ou selecione o código SAP...';
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  currentTicketId = null;
}

function renderMatLines(){
  const t = TICKETS[currentTicketId];
  const box = document.getElementById('matLines');
  box.innerHTML = '';
  if(t.mats.length===0){
    box.innerHTML = '<p class="pill-empty" style="margin:0 0 4px;">Nenhum material adicionado ainda.</p>';
    return;
  }
  const title = document.createElement('p');
  title.className = 'muted-small';
  title.style.margin = '0 0 2px';
  title.textContent = 'Materiais adicionados (' + t.mats.length + '):';
  box.appendChild(title);
  t.mats.forEach((m,idx)=>{
    const line = document.createElement('div');
    line.className = 'mat-line';
    line.innerHTML = '<span>'+(m.cod||'—')+' — '+m.desc+' ('+m.qtd+')'+(m.manual?' <em style="color:var(--text-muted);font-style:normal;">(manual)</em>':'')+matWarnIcon(t.mats,m)+'</span>'+
      '<button class="rm" data-idx="'+idx+'">remover</button>';
    box.appendChild(line);
  });
  box.querySelectorAll('.rm').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      t.mats.splice(parseInt(btn.dataset.idx),1);
      saveTicketsLS();
      renderMatLines();
    });
  });
}

function renderAcList(q, list){
  if(!q || q.length<2){ list.classList.remove('open'); list.innerHTML=''; return; }
  const nq = normalize(q);
  const matches = CATALOG.filter(c=> normalize(c.cod).includes(nq) || normalize(c.desc).includes(nq) ).slice(0,30);
  if(matches.length===0){ list.classList.remove('open'); list.innerHTML=''; return; }
  list.innerHTML = matches.map(c=>
    '<div class="ac-item" data-cod="'+c.cod+'"><span class="cod">'+c.cod+'</span>'+c.desc+'</div>'
  ).join('');
  list.classList.add('open');
  list.querySelectorAll('.ac-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const cod = el.dataset.cod;
      selectedItem = CATALOG.find(c=>c.cod===cod);
      document.getElementById('acInput').value = selectedItem.desc;
      document.getElementById('codBox').value = selectedItem.cod;
      document.getElementById('acList').classList.remove('open');
      document.getElementById('codAcList').classList.remove('open');
    });
  });
}

document.getElementById('btnCopyCod').addEventListener('click', ()=>{
  const box = document.getElementById('codBox');
  if(!box.value) return;
  const btn = document.getElementById('btnCopyCod');
  const done = ()=>{
    const prevLabel = btn.textContent;
    btn.textContent = 'Copiado!';
    btn.classList.add('copied');
    setTimeout(()=>{ btn.textContent = prevLabel; btn.classList.remove('copied'); }, 1500);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(box.value).then(done).catch(()=>{
      box.select(); document.execCommand('copy'); done();
    });
  }else{
    box.select(); document.execCommand('copy'); done();
  }
});

document.getElementById('acInput').addEventListener('input', (e)=>{
  selectedItem = null;
  document.getElementById('codBox').value = '';
  document.getElementById('codAcList').classList.remove('open');
  renderAcList(e.target.value, document.getElementById('acList'));
});

document.getElementById('codBox').addEventListener('input', (e)=>{
  const val = e.target.value.trim();
  const exact = CATALOG.find(c=> c.cod.toLowerCase() === val.toLowerCase());
  document.getElementById('acList').classList.remove('open');
  if(exact){
    selectedItem = exact;
    document.getElementById('acInput').value = exact.desc;
    document.getElementById('codAcList').classList.remove('open');
    document.getElementById('codAcList').innerHTML = '';
    return;
  }
  selectedItem = null;
  renderAcList(val, document.getElementById('codAcList'));
});

document.getElementById('manualMode').addEventListener('change', (e)=>{
  const on = e.target.checked;
  selectedItem = null;
  document.getElementById('acInput').value = '';
  document.getElementById('codBox').value = '';
  document.getElementById('acList').classList.remove('open');
  document.getElementById('codAcList').classList.remove('open');
  document.getElementById('modalErr').style.display = 'none';
  setManualMode(on);
});

document.getElementById('btnAddItem').addEventListener('click', ()=>{
  const errEl = document.getElementById('modalErr');
  const qtd = parseInt(document.getElementById('qtdInput').value) || 0;
  const manual = document.getElementById('manualMode').checked;
  let item;
  if(manual){
    const desc = document.getElementById('acInput').value.trim();
    const cod = document.getElementById('codBox').value.trim();
    if(!desc || qtd<1){
      errEl.textContent = !desc ? 'Informe a descrição do material.' : 'Informe uma quantidade válida.';
      errEl.style.display = 'block';
      return;
    }
    item = {cod:cod, desc:desc, qtd:qtd, manual:true};
  }else{
    if(!selectedItem || qtd<1){
      errEl.textContent = !selectedItem ? 'Selecione um material do catálogo antes de adicionar.' : 'Informe uma quantidade válida.';
      errEl.style.display = 'block';
      return;
    }
    item = {cod:selectedItem.cod, desc:selectedItem.desc, qtd:qtd, grupo:selectedItem.grupo||''};
  }
  errEl.style.display = 'none';
  TICKETS[currentTicketId].mats.push(item);
  saveTicketsLS();
  selectedItem = null;
  document.getElementById('acInput').value = '';
  document.getElementById('codBox').value = '';
  document.getElementById('qtdInput').value = 1;
  renderMatLines();
  document.getElementById('matLines').scrollIntoView({behavior:'smooth', block:'start'});
});

document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', ()=>{
  closeModal();
  renderTable();
});

document.getElementById('searchBox').addEventListener('input', (e)=>{
  filterText = e.target.value;
  renderTable();
});
document.getElementById('filterMat').addEventListener('change', (e)=>{
  filterMat = e.target.value;
  renderTable();
});

document.getElementById('dbFile').addEventListener('change', (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    try{
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {header:1});
      const newCatalog = [];
      for(let i=1;i<rows.length;i++){
        const r = rows[i];
        if(!r || !r[0]) continue;
        newCatalog.push({cod:String(r[0]), desc:String(r[1]||''), grupo:String(r[2]||'')});
      }
      if(newCatalog.length===0){
        document.getElementById('dbStatus').textContent = 'Não foi possível ler itens do arquivo. Verifique o formato (col. A = código, col. B = descrição).';
        return;
      }
      CATALOG = newCatalog;
      saveCatalogLS();
      document.getElementById('dbStatus').textContent = 'Catálogo carregado: '+f.name+' ('+CATALOG.length+' itens)';
    }catch(err){
      document.getElementById('dbStatus').textContent = 'Erro ao ler o arquivo anexado.';
    }
  };
  reader.readAsArrayBuffer(f);
});

function normHeader(s){
  return normalize(s).replace(/[^a-z0-9]/g,'');
}

document.getElementById('ticketsFile').addEventListener('change', (e)=>{
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  const statusEl = document.getElementById('ticketsStatus');
  statusEl.textContent = 'Lendo '+files.length+' arquivo(s)...';
  let pending = files.length;
  let hadError = false;
  const allRows = [];

  const COL_ALIASES = {
    data: ['data'],
    os: ['os','ordemdeservico','numeroos','ordemservico'],
    idOs: ['idos','idordemdeservico','idordemservico','iddaordemdeservico','iddaordemservico'],
    cliente: ['cliente','nomedocliente'],
    cidade: ['cidade'],
    uf: ['uf','estado'],
    tecnico: ['tecnico','tecnicoresponsavel'],
    tipo: ['tipo','tipodeatividade','tipoatividade'],
    area: ['area','areadetrabalho'],
  };

  function finishImport(){
    if(allRows.length===0){
      statusEl.textContent = hadError
        ? 'Não foi possível ler chamados dos arquivos selecionados.'
        : 'Nenhum chamado encontrado nos arquivos selecionados.';
      return;
    }
    const seen = new Set();
    const deduped = [];
    allRows.forEach(r=>{
      const key = r.os || r.idOs;
      if(!key || seen.has(key)) return;
      seen.add(key);
      deduped.push(r);
    });
    TICKETS.length = 0;
    deduped.forEach((t,i)=>{ t._id = i; TICKETS.push(t); });
    saveTicketsLS();
    statusEl.textContent = 'Base de chamados atualizada: '+files.length+' arquivo(s), '+TICKETS.length+' chamados.'+(hadError?' (algum arquivo com erro foi ignorado)':'');
    selectedItem = null;
    currentTicketId = null;
    renderTable();
  }

  files.forEach(f=>{
    const reader = new FileReader();
    reader.onload = function(ev){
      try{
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1});
        if(rows.length>1){
          const headerRow = rows[0].map(h=>normHeader(String(h||'')));
          const idx = {};
          Object.keys(COL_ALIASES).forEach(key=>{
            idx[key] = -1;
            for(const alias of COL_ALIASES[key]){
              const found = headerRow.indexOf(alias);
              if(found!==-1){ idx[key] = found; break; }
            }
          });
          for(let i=1;i<rows.length;i++){
            const r = rows[i];
            if(!r || r.every(c=>c===undefined||c===null||c==='')) continue;
            const get = (key)=> idx[key]>=0 ? String(r[idx[key]] ?? '').trim() : '';
            const os = get('os');
            const idOs = get('idOs');
            if(!os && !idOs) continue;
            allRows.push({
              data:get('data'), os, idOs, cliente:get('cliente'),
              cidade:get('cidade'), uf:get('uf'), tecnico:get('tecnico'),
              tipo:get('tipo'), area:get('area'), mats:[], classificacao:'', obs:''
            });
          }
        }
      }catch(err){
        hadError = true;
      }
      pending--;
      if(pending===0) finishImport();
    };
    reader.onerror = function(){
      hadError = true;
      pending--;
      if(pending===0) finishImport();
    };
    reader.readAsArrayBuffer(f);
  });
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const header = ['Data','Ordem de Serviço','ID da Ordem de Serviço','Cliente','Cidade','Estado','Técnico','Tipo de Atividade','Área de Trabalho','Classificação','Observações','Código SAP','Descrição do Material','Quantidade','Manual'];
  const rows = [];
  TICKETS.forEach(t=>{
    if(t.mats.length===0){
      rows.push([t.data,t.os,t.idOs,t.cliente,t.cidade,t.uf,t.tecnico,t.tipo,t.area,t.classificacao||'',t.obs||'','','','','']);
      return;
    }
    t.mats.forEach(m=>{
      rows.push([t.data,t.os,t.idOs,t.cliente,t.cidade,t.uf,t.tecnico,t.tipo,t.area,t.classificacao||'',t.obs||'',m.cod||'',m.desc,m.qtd,m.manual?'Sim':'Não']);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{wch:10},{wch:20},{wch:18},{wch:32},{wch:18},{wch:6},{wch:26},{wch:22},{wch:24},{wch:14},{wch:30},{wch:14},{wch:50},{wch:10},{wch:8}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Chamados e Materiais');
  XLSX.writeFile(wb, 'Chamados_Concluidos_SLN_Materiais.xlsx');
});

renderTable();
