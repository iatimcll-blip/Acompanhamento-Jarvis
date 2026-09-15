/*
 * Deixa as bases do Painel B2C mais leves ANTES de anexar no painel — pedido do
 * usuário (2026-09-15): aplicar o mesmo tratamento sempre que novas bases forem
 * anexadas, não só uma vez.
 *
 * Por que isso não pode virar código do painel_jarvis.html: o navegador só recebe o
 * arquivo DEPOIS que o usuário já selecionou no input de upload — nesse ponto o
 * arquivo já está inteiro em memória, e o SheetJS (XLSX.read/sheet_to_json) precisa
 * varrer o arquivo inteiro pra virar objetos JS antes de qualquer filtro rodar (é por
 * isso que o parse de MAX.xlsx já leva ~25s de CPU, medido e documentado no próprio
 * painel_jarvis.html perto de _b2cGetXlsxWorker). A única forma de reduzir esse custo
 * de verdade é o ARQUIVO já chegar menor — daí este script, que roda ANTES do upload,
 * numa pasta local com as bases baixadas do Power BI.
 *
 * As regras de filtro abaixo são as MESMAS já usadas em produção dentro de
 * b2cProcessFilesSequential() (painel_jarvis.html): nenhuma regra nova, só aplicada
 * mais cedo (no arquivo, não na memória do navegador depois de já ter parseado tudo).
 *   - Todas as bases: descarta as 2 linhas de rodapé que o exportador do Power BI
 *     sempre cola no fim (linha "Total" agregada + linha "Filtros aplicados: ..."),
 *     identificadas por terem a coluna de cluster em branco.
 *   - MAX.xlsx (extrato bruto nacional): além disso, mantém só as linhas do Gerente
 *     responsável por MA/PI ("Wellington Marcio" — B2C_MAX_GERENTE no painel),
 *     porque esse extrato vem com todos os gerentes/regiões do Brasil.
 *   - Clientes vs. MAX / Resumo Reparos MAX (pivots do Power BI, só conferência
 *     manual): não têm coluna de cluster e não passam por nenhum filtro no painel —
 *     copiados sem alteração.
 *
 * Uso:
 *   node scripts/slim-b2c-bases.js <pasta-com-as-bases> [pasta-de-saida]
 *   (pasta-de-saida padrão: <pasta-com-as-bases>/leve)
 *
 * Requer o pacote "adm-zip" (não é dependência do projeto — instale localmente se
 * precisar: npm install adm-zip --no-save, na raiz do repo ou em scripts/).
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const B2C_MAX_GERENTE = 'Wellington Marcio';

// Espelha B2C_FILE_TYPES do painel_jarvis.html — mesma ordem (clientesVsMax e
// resumoReparosMax ANTES de maxRaw: os 3 nomes de arquivo contêm "max").
const B2C_FILE_TYPES = [
  { key: 'reparosPrazo', match: /reparos?\s*prazo/i, sigCols: ['Reparo', 'codigo_os'] },
  { key: 'irt', match: /\birt\b/i, sigCols: ['Aging IRT', 'qtd_Reparos_totais'] },
  { key: 'mudEndereco', match: /mud.*endere/i, sigCols: ['qtd_Mud_Endereco'] },
  { key: 'mudComodo', match: /mud.*c[oô]modo/i, sigCols: ['qtd_Mud_Comodo'] },
  { key: 'upgrade', match: /upgrade/i, sigCols: ['qtd_Mud_Upgrade'] },
  { key: 'agingAltas', match: /aging\s*altas/i, sigCols: ['Qtd. Ativações', 'Data Criação Contrato'] },
  { key: 'efetividadeAltas', match: /efetividade\s*altas/i, sigCols: ['conclusao_os', 'Qtd. Total'] },
  { key: 'efetividadeReparos', match: /efetividade\s*reparos/i, sigCols: ['FILA', 'data_conclusao'] },
  { key: 'ifi', match: /\bifi\b/i, sigCols: ['Qtd IFI'] },
  { key: 'ifme', match: /\bifme\b|^data\.xlsx?$/i, sigCols: ['Qtd. IFME', 'Aging IFME'] },
  { key: 'irr', match: /\birr\b/i, sigCols: ['Qtd. IRR', 'Aging IRR'] },
  { key: 'plantaMedia', match: /planta\s*m[eé]dia/i, sigCols: ['Media Base Media'] },
  { key: 'clientesVsMax', match: /clientes.*max/i, sigCols: ['concat_max3'] },
  { key: 'resumoReparosMax', match: /resumo.*reparos.*max/i, sigCols: ['Chamados MAX3', 'Clientes MAX3'] },
  { key: 'maxRaw', match: /max/i, sigCols: ['MAX3', 'motivo_conclusao_real'] },
];
const REFERENCE_ONLY = new Set(['clientesVsMax', 'resumoReparosMax']);

function nk(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}
function detectType(fileName, headerKeys) {
  const nameHit = B2C_FILE_TYPES.find(t => t.match.test(fileName));
  if (nameHit) return { type: nameHit, byName: true };
  const nkKeys = new Set(headerKeys.map(nk));
  const sigHit = B2C_FILE_TYPES.find(t => t.sigCols.some(c => nkKeys.has(nk(c)))) || null;
  return sigHit ? { type: sigHit, byName: false } : null;
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}
function cellText(cellXml) {
  let m = cellXml.match(/<(?:x:)?is>\s*<(?:x:)?t[^>]*>([\s\S]*?)<\/(?:x:)?t>\s*<\/(?:x:)?is>/);
  if (m) return unescapeXml(m[1]);
  m = cellXml.match(/<(?:x:)?v>([\s\S]*?)<\/(?:x:)?v>/);
  if (m) return unescapeXml(m[1]);
  return '';
}
function splitCells(rowXml) {
  const inner = rowXml.replace(/^<(?:x:)?row[^>]*>/, '').replace(/<\/(?:x:)?row>$/, '');
  const cells = [];
  const re = /<(?:x:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:x:)?c>)/g;
  let m;
  while ((m = re.exec(inner))) cells.push(m[0]);
  return cells;
}

// keepFn(colIndexes, rowCells) -> bool. colIndexes é {nomeColuna: índice} do cabeçalho.
function slimSheetXml(xml, keepFn) {
  const rowRe = /<(?:x:)?row\b[^>]*>[\s\S]*?<\/(?:x:)?row>/g;
  const rows = xml.match(rowRe) || [];
  if (!rows.length) return { xml, origRows: 0, keptRows: 0 };

  const headerCells = splitCells(rows[0]).map(cellText);
  const colIdx = {};
  headerCells.forEach((h, i) => { colIdx[h] = i; });

  const kept = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const cells = splitCells(rows[i]);
    if (keepFn(colIdx, cells)) kept.push(rows[i]);
  }

  const newBody = kept.join('');
  const newXml = xml.slice(0, xml.indexOf(rows[0])) + newBody + xml.slice(xml.indexOf(rows[rows.length - 1]) + rows[rows.length - 1].length);
  return { xml: newXml, origRows: rows.length - 1, keptRows: kept.length - 1 };
}

function buildKeepFn(typeKey) {
  const clusterCol = typeKey === 'maxRaw' ? 'Cluster' : 'Novo Cluster';
  return (colIdx, cells) => {
    const ci = colIdx[clusterCol];
    if (ci === undefined) return true; // coluna não achada, não filtra (mesma cautela do painel)
    const clusterVal = ci < cells.length ? cellText(cells[ci]) : '';
    if (!clusterVal.trim()) return false; // linha de rodapé (Total / Filtros aplicados)
    if (typeKey === 'maxRaw') {
      const gi = colIdx['Gerente'];
      const gerente = gi !== undefined && gi < cells.length ? cellText(cells[gi]) : '';
      if (gerente.trim() !== B2C_MAX_GERENTE) return false;
    }
    return true;
  };
}

function main() {
  const inDir = process.argv[2];
  if (!inDir) {
    console.error('Uso: node scripts/slim-b2c-bases.js <pasta-com-as-bases> [pasta-de-saida]');
    process.exit(1);
  }
  const outDir = process.argv[3] || path.join(inDir, 'leve');
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(inDir).filter(f => /\.xlsx?$/i.test(f));
  const report = [];

  for (const f of files) {
    const full = path.join(inDir, f);
    const origSize = fs.statSync(full).size;
    const zip = new AdmZip(full);
    const sheetEntry = zip.getEntry('xl/worksheets/sheet1.xml');
    if (!sheetEntry) { console.warn(`${f}: sem xl/worksheets/sheet1.xml, copiando sem alteração`); fs.copyFileSync(full, path.join(outDir, f)); continue; }
    const xml = sheetEntry.getData().toString('utf8');

    // cabeçalho pra detectar o tipo (mesma lógica de b2cDetectFileType)
    const rowRe = /<(?:x:)?row\b[^>]*>[\s\S]*?<\/(?:x:)?row>/;
    const firstRow = xml.match(rowRe);
    const headerKeys = firstRow ? splitCells(firstRow[0]).map(cellText) : [];
    const detected = detectType(f, headerKeys);

    if (!detected) {
      console.warn(`AVISO: "${f}" não corresponde a nenhuma base conhecida do B2C (nem pelo nome, nem pelas colunas) — NÃO incluído em ${outDir}. Confira manualmente antes de anexar no painel.`);
      report.push({ file: f, type: '(não reconhecido — ignorado)', origRows: '-', keptRows: '-', origMB: (origSize / 1024 / 1024).toFixed(2), newMB: '-' });
      continue;
    }
    if (!detected.byName) {
      // Achado real (2026-09-15): IRTL.xlsx só bateu com "Efetividade Altas" porque a
      // coluna "Conclusão OS" normalizada colide com a assinatura "conclusao_os" —
      // aplicar o filtro daquele tipo aqui teria corrompido os dados de verdade
      // (IRTL.xlsx acabou sendo uma base DUPLICADA do IRT.xlsx, confirmado comparando
      // linha a linha por OS/Contrato — não um arquivo novo). Por segurança, qualquer
      // detecção que só bateu por assinatura de coluna (não pelo nome do arquivo) fica
      // de fora do lote leve — exige revisão manual, igual o caso do IRTL.
      console.warn(`AVISO: "${f}" só foi identificado como "${detected.type.key}" pela coluna, não pelo nome do arquivo — risco de colisão (ver caso IRTL.xlsx/Efetividade Altas). NÃO incluído em ${outDir}. Confira manualmente antes de anexar no painel.`);
      report.push({ file: f, type: `${detected.type.key} (só por coluna — ignorado)`, origRows: '-', keptRows: '-', origMB: (origSize / 1024 / 1024).toFixed(2), newMB: '-' });
      continue;
    }
    const type = detected.type;

    if (REFERENCE_ONLY.has(type.key)) {
      fs.copyFileSync(full, path.join(outDir, f));
      const newSize = fs.statSync(path.join(outDir, f)).size;
      report.push({ file: f, type: type.key, origRows: '-', keptRows: '-', origMB: (origSize / 1024 / 1024).toFixed(2), newMB: (newSize / 1024 / 1024).toFixed(2) });
      continue;
    }

    const { xml: newXml, origRows, keptRows } = slimSheetXml(xml, buildKeepFn(type.key));
    zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(newXml, 'utf8'));
    const outPath = path.join(outDir, f);
    zip.writeZip(outPath);
    const newSize = fs.statSync(outPath).size;
    report.push({ file: f, type: type.key, origRows, keptRows, origMB: (origSize / 1024 / 1024).toFixed(2), newMB: (newSize / 1024 / 1024).toFixed(2) });
  }

  console.log('\narquivo'.padEnd(24) + 'tipo'.padEnd(36) + 'linhas orig'.padEnd(13) + 'linhas final'.padEnd(14) + 'MB orig'.padEnd(9) + 'MB novo'.padEnd(9) + 'reducao');
  let totalOrig = 0, totalNew = 0;
  report.forEach(r => {
    totalOrig += parseFloat(r.origMB);
    const skipped = r.newMB === '-';
    if (!skipped) totalNew += parseFloat(r.newMB);
    const red = (!skipped && parseFloat(r.origMB)) ? (100 - parseFloat(r.newMB) / parseFloat(r.origMB) * 100).toFixed(1) + '%' : '-';
    console.log(r.file.padEnd(24) + String(r.type).padEnd(36) + String(r.origRows).padEnd(13) + String(r.keptRows).padEnd(14) + r.origMB.padEnd(9) + String(r.newMB).padEnd(9) + red);
  });
  console.log('\nTOTAL: ' + totalOrig.toFixed(2) + ' MB -> ' + totalNew.toFixed(2) + ' MB (' + (totalOrig ? (100 - totalNew / totalOrig * 100).toFixed(1) : '0.0') + '% menor)');
  console.log('\nSaída em: ' + outDir);
}

main();
