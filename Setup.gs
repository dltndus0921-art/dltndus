/**
 * 시트 초기 설정: 탭·헤더 만들기
 */

/** 없는 탭을 만들고, 1행이 비어 있는 탭에만 헤더를 쓴다. 기존 데이터는 건드리지 않는다. */
function setupSheets() {
  const ss = getDb_();
  const lines = [];
  Object.keys(SCHEMA).forEach(function (key) {
    const def = SCHEMA[key];
    let sh = ss.getSheetByName(def.sheet);
    if (!sh) {
      sh = ss.insertSheet(def.sheet);
      lines.push('+ [' + def.sheet + '] 탭 생성');
    }
    const firstRow = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    if (firstRow.every(function (v) { return v === ''; })) {
      sh.getRange(1, 1, 1, def.headers.length)
        .setValues([def.headers])
        .setFontWeight('bold')
        .setBackground('#E8F5E9');
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, def.headers.length);
      lines.push('+ [' + def.sheet + '] 헤더 작성 (' + def.headers.length + '열)');
    } else {
      lines.push('· [' + def.sheet + '] 기존 헤더 유지');
    }
    // 시간·연락처·일시가 시트에서 날짜/숫자로 바뀌지 않도록 텍스트 형식으로 고정
    (def.textColumns || []).forEach(function (h) {
      const col = def.headers.indexOf(h) + 1;
      if (col > 0) sh.getRange(1, col, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
    });
  });

  // 새 스프레드시트에 기본으로 있는 빈 "시트1"은 지운다
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (/^(시트|Sheet)\d+$/.test(name) && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
      lines.push('- [' + name + '] 빈 기본 탭 삭제');
    }
  });
  clearMemo_();
  return lines;
}
