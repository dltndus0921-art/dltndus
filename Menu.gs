/**
 * 스프레드시트 상단 메뉴 "온마을복지관"
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('온마을복지관')
    .addItem('앱 미리보기 열기', 'menuOpenApp')
    .addSeparator()
    .addItem('DB 탭·헤더 만들기', 'menuSetupSheets')
    .addItem('예시 데이터 넣기', 'menuInsertSampleData')
    .addToUi();
}

function menuOpenApp() {
  const html = buildApp_().setWidth(430).setHeight(780);
  SpreadsheetApp.getUi().showModalDialog(html, CENTER.name);
}

function menuSetupSheets() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'DB 탭·헤더 만들기',
    '없는 탭을 만들고, 비어 있는 탭에만 헤더를 씁니다.\n이미 입력된 데이터는 바꾸지 않습니다.\n\n진행할까요?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  ui.alert('완료', setupSheets().join('\n'), ui.ButtonSet.OK);
}

function menuInsertSampleData() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    '예시 데이터 넣기',
    '회원·강좌·신청·게시글·봉사 연습용 데이터를 넣습니다.\n비어 있는 탭에만 넣고, 이미 데이터가 있는 탭은 건드리지 않습니다.\n\n진행할까요?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  ui.alert('완료', insertSampleData().join('\n'), ui.ButtonSet.OK);
}
