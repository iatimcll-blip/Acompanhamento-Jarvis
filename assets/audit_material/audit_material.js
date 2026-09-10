
TICKETS.forEach((t,i)=>{ t._id = i; t.mats = []; });

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

function renderTable(){
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  const visible = TICKETS.filter(ticketMatches);
  visible.forEach(t=>{
    const tr = document.createElement('tr');
    const matHtml = t.mats.length
      ? t.mats.map(m=>'<span class="badge">'+m.cod+' — '+m.desc+' ('+m.qtd+')</span>').join('')
        + '<br><button class="btn-add-mat" data-id="'+t._id+'" style="margin-top:4px;">Editar</button>'
      : '<span class="pill-empty">Nenhum material lançado</span>'
        + '<button class="btn-add-mat" data-id="'+t._id+'">+ Materiais</button>';
    tr.innerHTML =
      '<td>'+t.data+'</td>'+
      '<td>'+t.os+'</td>'+
      '<td>'+t.cliente+'</td>'+
      '<td>'+t.cidade+(t.uf?('/'+t.uf):'')+'</td>'+
      '<td>'+t.tecnico+'</td>'+
      '<td>'+t.tipo+'</td>'+
      '<td>'+matHtml+'</td>';
    tbody.appendChild(tr);
  });
  document.querySelectorAll('.btn-add-mat').forEach(b=>{
    b.addEventListener('click', ()=>openModal(parseInt(b.dataset.id)));
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
  document.getElementById('qtdInput').value = 1;
  document.getElementById('modalErr').style.display = 'none';
  selectedItem = null;
  renderMatLines();
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  currentTicketId = null;
}

function renderMatLines(){
  const t = TICKETS[currentTicketId];
  const box = document.getElementById('matLines');
  box.innerHTML = '';
  t.mats.forEach((m,idx)=>{
    const line = document.createElement('div');
    line.className = 'mat-line';
    line.innerHTML = '<span>'+m.cod+' — '+m.desc+' ('+m.qtd+')</span>'+
      '<button class="rm" data-idx="'+idx+'">remover</button>';
    box.appendChild(line);
  });
  box.querySelectorAll('.rm').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      t.mats.splice(parseInt(btn.dataset.idx),1);
      renderMatLines();
    });
  });
}

function renderAcList(q){
  const list = document.getElementById('acList');
  if(!q || q.length<2){ list.classList.remove('open'); list.innerHTML=''; return; }
  const nq = normalize(q);
  const matches = CATALOG.filter(c=> normalize(c.cod).includes(nq) || normalize(c.desc).includes(nq) ).slice(0,30);
  if(matches.length===0){ list.classList.remove('open'); list.innerHTML=''; return; }
  list.innerHTML = matches.map(c=>
    '<div class="ac-item" data-cod="'+c.cod+'">'+c.desc+'</div>'
  ).join('');
  list.classList.add('open');
  list.querySelectorAll('.ac-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const cod = el.dataset.cod;
      selectedItem = CATALOG.find(c=>c.cod===cod);
      document.getElementById('acInput').value = selectedItem.desc;
      document.getElementById('codBox').value = selectedItem.cod;
      list.classList.remove('open');
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
  renderAcList(e.target.value);
});

document.getElementById('btnAddItem').addEventListener('click', ()=>{
  const errEl = document.getElementById('modalErr');
  const qtd = parseInt(document.getElementById('qtdInput').value) || 0;
  if(!selectedItem || qtd<1){
    errEl.textContent = !selectedItem ? 'Selecione um material do catálogo antes de adicionar.' : 'Informe uma quantidade válida.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  TICKETS[currentTicketId].mats.push({cod:selectedItem.cod, desc:selectedItem.desc, qtd:qtd});
  selectedItem = null;
  document.getElementById('acInput').value = '';
  document.getElementById('codBox').value = '';
  document.getElementById('qtdInput').value = 1;
  renderMatLines();
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
      document.getElementById('dbStatus').textContent = 'Catálogo carregado: '+f.name+' ('+CATALOG.length+' itens)';
    }catch(err){
      document.getElementById('dbStatus').textContent = 'Erro ao ler o arquivo anexado.';
    }
  };
  reader.readAsArrayBuffer(f);
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const header = ['Data','Ordem de Serviço','ID da Ordem de Serviço','Cliente','Cidade','Estado','Técnico','Tipo de Atividade','Área de Trabalho','Materiais Aplicados'];
  const rows = TICKETS.map(t=>{
    const matsStr = t.mats.map(m=> m.cod+' - '+m.desc+' (qtd: '+m.qtd+')').join('; ');
    return [t.data,t.os,t.idOs,t.cliente,t.cidade,t.uf,t.tecnico,t.tipo,t.area,matsStr];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{wch:10},{wch:20},{wch:18},{wch:32},{wch:18},{wch:6},{wch:26},{wch:22},{wch:24},{wch:50}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Concluidos');
  XLSX.writeFile(wb, 'Chamados_Concluidos_SLN_Materiais.xlsx');
});

renderTable();
