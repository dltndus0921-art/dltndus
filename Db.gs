/**
 * DB 접근 계층: 이 스크립트가 바인딩된 스프레드시트를 DB로 쓴다.
 * 한 번 실행하는 동안 같은 탭을 여러 번 읽지 않도록 메모(TABLE_MEMO_)에 담아 두고,
 * 쓰기(추가·수정)가 일어나면 메모를 비운다.
 */

let TABLE_MEMO_ = {};

function clearMemo_() { TABLE_MEMO_ = {}; }

function getDb_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(key) {
  const def = SCHEMA[key];
  const sh = getDb_().getSheetByName(def.sheet);
  if (!sh) throw new Error('"' + def.sheet + '" 탭이 없습니다. 시트 메뉴 "온마을복지관 → DB 탭·헤더 만들기"를 먼저 실행하세요.');
  return sh;
}

function headersOf_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** 테이블 전체를 객체 배열로 읽는다. 날짜(Date)는 yyyy-MM-dd 문자열로 바꾼다. */
function readTable_(key) {
  if (!TABLE_MEMO_[key]) {
    const sh = getSheet_(key);
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    let rows = [];
    if (lastRow >= 2) {
      const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
      const headers = values.shift().map(function (h) { return String(h).trim(); });
      const tz = Session.getScriptTimeZone();
      rows = values
        .filter(function (r) { return r.some(function (v) { return v !== ''; }); })
        .map(function (r) {
          const obj = {};
          headers.forEach(function (h, i) {
            if (!h) return;
            const v = r[i];
            obj[h] = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
          });
          return obj;
        });
    }
    TABLE_MEMO_[key] = rows;
  }
  return TABLE_MEMO_[key].map(function (r) { return Object.assign({}, r); });
}

/** 객체 여러 건을 헤더 위치에 맞춰 마지막 행 아래에 추가한다. */
function appendRecords_(key, records) {
  if (!records.length) return;
  const sh = getSheet_(key);
  const headers = headersOf_(sh);
  if (!headers.length) throw new Error('"' + SCHEMA[key].sheet + '" 탭에 헤더가 없습니다. "DB 탭·헤더 만들기"를 실행하세요.');
  const rows = records.map(function (rec) {
    return headers.map(function (h) { return rec[h] === undefined ? '' : rec[h]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  clearMemo_();
}

/** ID로 한 행을 찾아 patch에 적힌 칸만 바꾼다. 찾으면 true, 없으면 false. */
function updateRecord_(key, idField, id, patch) {
  const sh = getSheet_(key);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  const headers = headersOf_(sh);
  const idCol = headers.indexOf(idField);
  if (idCol < 0) throw new Error('"' + idField + '" 헤더를 찾을 수 없습니다.');
  const ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(id)) continue;
    Object.keys(patch).forEach(function (h) {
      const c = headers.indexOf(h);
      if (c < 0) throw new Error('"' + h + '" 헤더를 찾을 수 없습니다.');
      sh.getRange(i + 2, c + 1).setValue(patch[h]);
    });
    clearMemo_();
    return true;
  }
  return false;
}

/** 지금까지 가장 큰 번호 + 1로 다음 ID를 만든다 (예: ENR-0001). */
function nextId_(key) {
  const prefix = ID_PREFIX[key];
  const field = ID_FIELD[key];
  const re = new RegExp('^' + prefix + '(\\d+)$');
  let max = 0;
  readTable_(key).forEach(function (r) {
    const m = re.exec(String(r[field] || ''));
    if (m && Number(m[1]) > max) max = Number(m[1]);
  });
  return prefix + ('000' + (max + 1)).slice(-4);
}

/** 쓰기 작업을 한 번에 한 사람씩만 하도록 잠근다 (정원 초과·ID 중복 방지). */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    clearMemo_();
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 화면에 필요한 모든 탭을 한 번씩 읽는다. */
function readAll_() {
  const t = {};
  Object.keys(SCHEMA).forEach(function (key) { t[key] = readTable_(key); });
  return t;
}
