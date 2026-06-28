const SHEET_ID = '1xaXSMiecUx2QOvkmPWYKjzFcafEikvJie1Lf9lgltX0';
const CHUNK = 45000;

function _out(o, cb) {
  var s = JSON.stringify(o);
  return ContentService
    .createTextOutput(cb ? cb + '(' + s + ');' : s)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function _sheet(ss, n) {
  return ss.getSheetByName(n) || ss.insertSheet(n);
}

function _readState(ss) {
  var sh = ss.getSheetByName('PainelState');
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  var txt = vals.map(function(r) { return r[0] || ''; }).join('');
  return txt ? JSON.parse(txt) : null;
}

function _writeState(ss, state) {
  var sh = _sheet(ss, 'PainelState');
  sh.clearContents();
  sh.appendRow(['Parte', 'JSON', 'Atualizado']);
  var txt = JSON.stringify(state || {});
  var ts = new Date().toISOString();
  for (var i = 0, p = 1; i < txt.length; i += CHUNK, p++) {
    sh.appendRow([p, txt.slice(i, i + CHUNK), ts]);
  }
  return { parts: Math.ceil(txt.length / CHUNK), bytes: txt.length, savedAt: ts };
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var meta = _writeState(ss, d.state || d);
    return _out({ status: 'ok', meta: meta });
  } catch (err) {
    return _out({ status: 'error', msg: err.message });
  }
}

function doGet(e) {
  try {
    var cb = e && e.parameter && e.parameter.callback;
    var ss = SpreadsheetApp.openById(SHEET_ID);
    return _out({ status: 'ok', state: _readState(ss) }, cb);
  } catch (err) {
    return _out({ status: 'error', msg: err.message }, e && e.parameter && e.parameter.callback);
  }
}
