// Simulation of project 6 (온마을 복지관 앱): 백엔드는 가짜 시트, 화면은 가상 브라우저(jsdom)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createContext } = require('./gasmock');

const DIR = process.argv[2];
const FILES = ['Schema.gs', 'Db.gs', 'Util.gs', 'Setup.gs', 'SampleData.gs', 'Code.gs', 'Programs.gs', 'Community.gs', 'Volunteer.gs', 'Menu.gs'];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function throws(fn) { try { fn(); return null; } catch (e) { return e.message; } }
const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
function hasDate(o) { if (isDate(o)) return true; if (o && typeof o === 'object') return Object.values(o).some(hasDate); return false; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function plus(n) { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); }
const TODAY = fmt(new Date());
const J = o => JSON.stringify(o);

function freshBackend(withSample = true) {
  const g = createContext(DIR, FILES);
  g.run('setupSheets()');
  if (withSample) g.run('insertSampleData()');
  const as = email => { g.ctx.__activeEmail = email; };
  const tbl = key => g.run(`readTable_('${key}')`);
  const asMember = (id, email) => { g.run(`updateRecord_('members','회원ID','${id}',{'이메일':'${email}'})`); as(email); };
  return { g, as, tbl, asMember };
}

// ================= 1. 서버 함수 =================
console.log('\n[1] 서버 함수');
{
  const g0 = createContext(DIR, FILES);
  check('탭이 없을 때 getAppData는 안내 메시지로 실패', /DB 탭·헤더 만들기/.test(throws(() => g0.run('getAppData()')) || ''));

  g0.run('onOpen()');
  check('onOpen: "온마을복지관" 메뉴 3개 항목', g0.ui.menu && g0.ui.menu.name === '온마을복지관' && g0.ui.menu.items.length === 3);
  g0.ui.menu.items.forEach(([label, fn]) => check(`메뉴 "${label}" → 함수 ${fn} 존재`, g0.run(`typeof ${fn}`) === 'function'));

  const lines = g0.run('setupSheets()');
  const schema = g0.run('JSON.stringify(SCHEMA)');
  const SC = JSON.parse(schema);
  check('9개 DB 탭 생성', Object.values(SC).every(d => g0.ss.getSheetByName(d.sheet)) && Object.keys(SC).length === 9);
  check('빈 기본 "시트1" 삭제됨', !g0.ss.getSheetByName('시트1') && g0.ss.getSheets().length === 9);
  check('모든 탭의 1행 헤더가 정의와 일치', Object.values(SC).every(d => J(g0.ss.getSheetByName(d.sheet).getRange(1, 1, 1, d.headers.length).getValues()[0]) === J(d.headers)));
  const progSheet = g0.ss.getSheetByName('02_DB_프로그램');
  const textCols = progSheet.formats.filter(f => f.f === '@').map(f => f.c);
  check('시간·요일 열이 텍스트 형식으로 고정됨 (요일/시작시간/종료시간)', [9, 10, 11].every(c => textCols.indexOf(c) >= 0), textCols);
  check('연락처 열이 텍스트 형식', g0.ss.getSheetByName('01_DB_회원').formats.some(f => f.f === '@' && f.c === 5));
  const again = g0.run('setupSheets()');
  check('setupSheets 두 번째 실행은 기존 헤더 유지 (데이터 안 건드림)', again.every(l => /기존 헤더 유지/.test(l)) && again.length === 9, again);

  check('회원이 없으면 getAppData가 안내 메시지로 실패', /등록된 회원이 없습니다/.test(throws(() => g0.run('getAppData()')) || ''));
  check('회원이 없으면 쓰기 함수도 안내 메시지로 실패', /등록된 회원이 없습니다/.test(throws(() => g0.run("applyProgram('PRG-0001')")) || ''));

  // 유틸
  check('parseDays_: "화,목" / "월·수·금" / 빈 값', J(g0.run("parseDays_('화,목')")) === '["화","목"]' && J(g0.run("parseDays_('월·수·금')")) === '["월","수","금"]' && g0.run("parseDays_('')").length === 0);
  check('sessionDates_: 2026-01-05(월)~01-18, 월·수 → 4일', J(g0.run("sessionDates_('2026-01-05','2026-01-18','월,수')")) === J(['2026-01-05', '2026-01-07', '2026-01-12', '2026-01-14']));
  check('sessionDates_: 요일이 없거나 날짜가 틀리면 빈 목록', g0.run("sessionDates_('2026-01-05','2026-01-18','')").length === 0 && g0.run("sessionDates_('x','y','월')").length === 0);
  check('maskPhone_', g0.run("maskPhone_('010-3849-1234')") === '010-3849-****' && g0.run("maskPhone_('')") === '');
  check('daysBetween_ / weekdayChar_', g0.run("daysBetween_('2026-01-01','2026-01-11')") === 10 && g0.run("weekdayChar_('2026-01-05')") === '월');
  check('agoText_: 형식이 틀리면 날짜 일부 그대로', g0.run("agoText_('abc')") === 'abc');
}

{
  const { g, as, tbl, asMember } = freshBackend();
  const lines = g.run('insertSampleData()');
  check('예시 데이터를 두 번 넣어도 중복되지 않음 (전 탭 건너뜀)', lines.length === 9 && lines.every(l => /건너뜀/.test(l)), lines);
  check('시트에 저장된 회원 연락처가 문자열 그대로', tbl('members')[0]['연락처'] === '010-3849-1234');
  check('시트에 저장된 시작시간이 "10:00" 문자열 그대로', tbl('programs')[0]['시작시간'] === '10:00');

  let a = g.run('getAppData()');
  check('getAppData 결과에 Date 객체 없음(전송 가능)', !hasDate(a));
  check('이메일이 일치하는 회원이 없으면 첫 회원(김미숙)을 미리보기로', a.demo === true && a.me.name === '김미숙' && a.me.id === 'MEM-0001');
  check('나이 = 올해 - 출생연도 (1957)', a.me.age === Number(TODAY.slice(0, 4)) - 1957);
  check('연락처는 뒤 4자리 가림', a.me.phone === '010-3849-****');
  check('오늘 날짜·요일 포함', a.today.date === TODAY && a.today.weekday.length === 1);

  const P = id => a.programs.find(p => p.id === id);
  check('강좌 6개, 시작일 순 정렬', a.programs.length === 6 && a.programs[0].id === 'PRG-0004' && a.programs[1].id === 'PRG-0002' && a.programs[5].id === 'PRG-0006', a.programs.map(p => p.id));
  check('PRG-0001 접수중, 잔여 7석', P('PRG-0001').state === 'open' && P('PRG-0001').remaining === 7);
  check('PRG-0002 마감임박(잔여 2석)', P('PRG-0002').state === 'closing' && P('PRG-0002').remaining === 2);
  check('PRG-0003 정원 마감 + 대기 2명', P('PRG-0003').state === 'full' && P('PRG-0003').waiting === 2 && P('PRG-0003').remaining === 0);
  check('PRG-0004 개강 후라 접수 마감, 내 상태는 신청완료', P('PRG-0004').state === 'closed' && P('PRG-0004').myStatus === '신청완료');
  check('PRG-0005 접수중 잔여 4석, 내가 신청함', P('PRG-0005').state === 'open' && P('PRG-0005').remaining === 4 && P('PRG-0005').myStatus === '신청완료');
  check('시간 문구: 매주 화·목 10:00 ~ 11:30', P('PRG-0001').timeText === '매주 화·목 10:00 ~ 11:30', P('PRG-0001').timeText);

  check('통계: 수강 2건, 봉사 24시간, 내 글 1개', a.stats.enrolled === 2 && a.stats.volunteerHours === 24 && a.stats.posts === 1, a.stats);
  check('봉사: 1365 연계 완료, 최근 내역 5건', a.volunteer.linked1365 === true && a.volunteer.logs.length === 5);
  check('오늘 수업 1건(요가교실), 아직 출석 전', a.todaySessions.length === 1 && a.todaySessions[0].title === '은빛 활력 요가교실' && a.todaySessions[0].attended === false);
  const yoga = a.myEnrollments.find(e => e.program.id === 'PRG-0004');
  check('내 신청 2건, 요가는 출석 2회', a.myEnrollments.length === 2 && yoga.attended === 2 && yoga.started === true);
  check('출석 진행률 = 2/총회차', yoga.totalSessions > 2 && yoga.progress === Math.round(2 / yoga.totalSessions * 1000) / 10, yoga);
  check('원예 강좌는 개강 대기(아직 시작 안 함)', a.myEnrollments.find(e => e.program.id === 'PRG-0005').started === false);
  check('캘린더에 오늘 수업 일정 포함', a.scheduleEvents.some(e => e.date === TODAY && e.kind === 'class'));

  check('게시글 6개, 최신순', a.posts.length === 6 && a.posts[0].id === 'PST-0002' && a.posts[5].id === 'PST-0005', a.posts.map(p => p.id));
  const post = id => a.posts.find(p => p.id === id);
  check('상대 시간 문구 (30분 전 / 2시간 전 / 2일 전)', post('PST-0002').ago === '30분 전' && post('PST-0001').ago === '2시간 전' && post('PST-0005').ago === '2일 전', [post('PST-0002').ago, post('PST-0001').ago, post('PST-0005').ago]);
  check('좋아요·댓글 집계', post('PST-0001').likeCount === 3 && post('PST-0001').commentCount === 2 && post('PST-0001').likedByMe === false);
  check('내가 누른 좋아요 표시', post('PST-0002').likedByMe === true);
  check('공지 구분, 내 글 구분', post('PST-0003').isNotice === true && post('PST-0006').isMine === true && post('PST-0001').isMine === false);

  check('봉사 모집 2건, 일자순', a.recruits.length === 2 && a.recruits[0].id === 'RCT-0001');
  check('RCT-0001 마감 D-2 → 마감임박, 신청 1명 잔여 2명', a.recruits[0].state === 'closing' && a.recruits[0].dDay === 2 && a.recruits[0].applied === 1 && a.recruits[0].remaining === 2, a.recruits[0]);
  check('RCT-0002 접수중', a.recruits[1].state === 'open' && a.recruits[1].dDay === 9);

  // ---- 이메일로 회원 찾기 ----
  as('nobody@x.com');
  check('이메일이 일치하지 않으면 계속 미리보기 회원', g.run('getAppData()').demo === true);
  asMember('MEM-0002', 'Lee@Test.com');
  as('lee@test.com');
  const lee = g.run('getAppData()');
  check('이메일 일치(대소문자 무시) → 해당 회원, 미리보기 아님', lee.demo === false && lee.me.name === '이순자');
  check('이순자는 신청 3건(관절체조·스마트폰·수채화)', lee.stats.enrolled === 3, lee.stats);
  as('');

  // ---- 수강 신청 / 대기 / 취소 ----
  let r = g.run("applyProgram('PRG-0001')");
  check('신청 성공 메시지 + 화면 데이터 갱신', r.message === '수강 신청이 완료되었습니다!' && r.app.programs.find(p => p.id === 'PRG-0001').myStatus === '신청완료');
  check('신청 후 잔여석 7 → 6', r.app.programs.find(p => p.id === 'PRG-0001').remaining === 6);
  check('시트에 신청완료 행 추가 (ENR-0012)', tbl('enrollments').some(e => e['신청ID'] === 'ENR-0012' && e['회원ID'] === 'MEM-0001' && e['상태'] === '신청완료'));
  check('같은 강좌 중복 신청은 거절', /이미 신청/.test(throws(() => g.run("applyProgram('PRG-0001')")) || ''));
  check('없는 강좌 신청은 거절', /존재하지 않거나/.test(throws(() => g.run("applyProgram('PRG-9999')")) || ''));
  g.run(`updateRecord_('programs','프로그램ID','PRG-0006',{'시작일':parseDate_('${plus(-1)}')})`);
  check('개강한 강좌는 접수 마감으로 거절', /접수가 마감/.test(throws(() => g.run("applyProgram('PRG-0006')")) || ''));
  g.run(`updateRecord_('programs','프로그램ID','PRG-0006',{'시작일':parseDate_('${plus(20)}')})`);
  g.run(`updateRecord_('programs','프로그램ID','PRG-0001',{'상태':'폐강'})`);
  check('폐강된 강좌는 목록에서 빠지고 신청도 거절', !g.run('getAppData()').programs.some(p => p.id === 'PRG-0001') && /폐강/.test(throws(() => g.run("applyProgram('PRG-0001')")) || ''));
  g.run(`updateRecord_('programs','프로그램ID','PRG-0001',{'상태':'개설'})`);

  r = g.run("applyProgram('PRG-0003')");
  check('정원 마감 강좌는 대기 신청 (3번째)', /3번째/.test(r.message) && r.app.programs.find(p => p.id === 'PRG-0003').myStatus === '대기' && r.app.programs.find(p => p.id === 'PRG-0003').myWaitNo === 3, r.message);
  check('시트에 대기번호 3 저장', tbl('enrollments').some(e => e['프로그램ID'] === 'PRG-0003' && e['회원ID'] === 'MEM-0001' && Number(e['대기번호']) === 3));
  check('정원은 그대로 (대기는 정원에 안 셈)', r.app.programs.find(p => p.id === 'PRG-0003').remaining === 0 && r.app.programs.find(p => p.id === 'PRG-0003').waiting === 3);

  // 정원이 정확히 차는지: 관절체조 잔여 2 → 김미숙 신청 → 잔여 1 → 정다은 신청 → 잔여 0(정원 마감)
  g.run("applyProgram('PRG-0002')");
  asMember('MEM-0005', 'daeun@test.com');
  r = g.run("applyProgram('PRG-0002')");
  const p2 = r.app.programs.find(p => p.id === 'PRG-0002');
  check('마지막 한 자리까지 신청되면 정원 마감 상태', p2.remaining === 0 && p2.state === 'full' && p2.enrolled === 5, p2);
  as('');

  // 취소
  const myWait = tbl('enrollments').find(e => e['프로그램ID'] === 'PRG-0003' && e['회원ID'] === 'MEM-0001')['신청ID'];
  const lee2Id = tbl('enrollments').find(e => e['프로그램ID'] === 'PRG-0003' && e['회원ID'] === 'MEM-0002')['신청ID'];
  check('다른 사람(이순자)의 신청 취소 시도는 거절', /본인의 신청만/.test(throws(() => g.run(`cancelApplication('${lee2Id}')`)) || ''));
  check('없는 신청 취소는 거절', /찾을 수 없습니다/.test(throws(() => g.run("cancelApplication('ENR-9999')")) || ''));
  r = g.run(`cancelApplication('${myWait}')`);
  check('내 대기 신청 취소', /취소되었습니다/.test(r.message) && !r.app.programs.find(p => p.id === 'PRG-0003').myStatus);
  check('취소 후 같은 신청 재취소는 거절', /이미 취소/.test(throws(() => g.run(`cancelApplication('${myWait}')`)) || ''));

  // 이순자가 신청완료 취소 → 대기 1번(최민우)이 자동 신청완료, 정다은이 대기 1번으로 당겨짐
  as('lee@test.com');
  r = g.run(`cancelApplication('${lee2Id}')`);
  as('');
  const e3 = tbl('enrollments').filter(e => e['프로그램ID'] === 'PRG-0003');
  const byMem = m => e3.find(e => e['회원ID'] === m);
  check('신청완료 취소 시 대기 1번이 자동 승급', /자리가 넘어갔어요/.test(r.message) && byMem('MEM-0004')['상태'] === '신청완료', e3.map(e => e['회원ID'] + ':' + e['상태']));
  check('남은 대기자 번호가 1번으로 당겨짐', byMem('MEM-0005')['상태'] === '대기' && Number(byMem('MEM-0005')['대기번호']) === 1);
  check('취소한 행은 상태 취소·대기번호 비움', byMem('MEM-0002')['상태'] === '취소' && byMem('MEM-0002')['대기번호'] === '');

  // ---- 출석 체크 ----
  r = g.run("checkIn('ENR-0001')");
  check('오늘 수업 출석 성공 → 출석 3회', /출석이 완료/.test(r.message) && r.app.myEnrollments.find(e => e.id === 'ENR-0001').attended === 3 && r.app.todaySessions[0].attended === true);
  check('같은 날 두 번 출석은 거절', /이미 출석/.test(throws(() => g.run("checkIn('ENR-0001')")) || ''));
  check('수업이 없는 날(원예)은 출석 거절', /수업이 있는 날이 아닙니다/.test(throws(() => g.run("checkIn('ENR-0002')")) || ''));
  check('남의 수강 내역 출석 거절', /본인의 수강 내역이 아닙니다/.test(throws(() => g.run("checkIn('ENR-0004')")) || ''));
  check('출석 행이 시트에 저장 (ATT-0003)', tbl('attendance').some(x => x['출석ID'] === 'ATT-0003' && x['출석일'] === TODAY));

  // ---- 글·좋아요·댓글 ----
  check('내용 없는 글은 거절', /내용을 입력/.test(throws(() => g.run("createPost({type:'일상소통',content:'  '})")) || ''));
  check('공지는 회원이 쓸 수 없음', /올릴 수 없는/.test(throws(() => g.run("createPost({type:'공지',content:'안녕'})")) || ''));
  check('1000자 초과 거절', /1000자/.test(throws(() => g.run(`createPost({type:'일상소통',content:'${'가'.repeat(1001)}'})`)) || ''));
  check('제목 40자 초과 거절', /제목은 40자/.test(throws(() => g.run(`createPost({type:'일상소통',title:'${'나'.repeat(41)}',content:'내용'})`)) || ''));
  r = g.run("createPost({type:'재능나눔',title:'한글 가르쳐 드려요',content:'  매주 토요일 오전 한글 쓰기를 같이해요  '})");
  check('글 등록 성공 → 최신 글 맨 위, 내 글 표시', r.app.posts[0].title === '한글 가르쳐 드려요' && r.app.posts[0].isMine === true && r.app.posts[0].type === '재능나눔' && r.app.posts[0].ago === '방금 전', r.app.posts[0]);
  check('내용 앞뒤 공백 제거되어 저장', tbl('posts').pop()['내용'] === '매주 토요일 오전 한글 쓰기를 같이해요');
  check('내 글 수 +1', r.app.stats.posts === 2);
  r = g.run("createPost({content:'종류를 안 골라도 일상소통으로'})");
  check('종류 생략 시 일상소통', r.app.posts[0].type === '일상소통');

  r = g.run("toggleLike('PST-0002')");
  const lk = id => r.app.posts.find(p => p.id === id);
  check('이미 누른 좋아요를 다시 누르면 취소', lk('PST-0002').likedByMe === false && lk('PST-0002').likeCount === 0);
  r = g.run("toggleLike('PST-0002')");
  check('한 번 더 누르면 다시 좋아요 (행 추가 없이 상태만 변경)', lk('PST-0002').likedByMe === true && lk('PST-0002').likeCount === 1 && tbl('likes').filter(l => l['글ID'] === 'PST-0002').length === 1);
  r = g.run("toggleLike('PST-0003')");
  check('처음 누르는 글은 좋아요 행 추가', lk('PST-0003').likedByMe === true && tbl('likes').some(l => l['좋아요ID'] === 'LKE-0005'));
  check('없는 글 좋아요는 거절', /글을 찾을 수 없습니다/.test(throws(() => g.run("toggleLike('PST-9999')")) || ''));

  check('빈 댓글은 거절', /댓글 내용을 입력/.test(throws(() => g.run("addComment('PST-0001',' ')")) || ''));
  check('300자 초과 댓글은 거절', /300자/.test(throws(() => g.run(`addComment('PST-0001','${'다'.repeat(301)}')`)) || ''));
  check('없는 글에 댓글은 거절', /글을 찾을 수 없습니다/.test(throws(() => g.run("addComment('PST-9999','안녕')")) || ''));
  r = g.run("addComment('PST-0001','저도 뜨개질 배우고 싶어요')");
  check('댓글 등록 → 댓글 3개, 마지막이 방금 쓴 댓글', lk('PST-0001').commentCount === 3 && lk('PST-0001').comments[2].content === '저도 뜨개질 배우고 싶어요' && lk('PST-0001').comments[2].isMine === true);
  g.run(`updateRecord_('posts','글ID','PST-0004',{'상태':'삭제'})`);
  check('삭제 상태 글은 목록에서 빠지고 댓글도 거절', !g.run('getAppData()').posts.some(p => p.id === 'PST-0004') && /글을 찾을 수 없습니다/.test(throws(() => g.run("addComment('PST-0004','안녕')")) || ''));

  // ---- 봉사 ----
  r = g.run("applyVolunteer('RCT-0002')");
  check('봉사 신청 성공 → 신청 상태', /봉사 참여 신청이 완료/.test(r.message) && r.app.recruits.find(x => x.id === 'RCT-0002').myStatus === '신청');
  check('봉사 신청 행이 시트에 저장 (활동일·인정시간 포함)', tbl('volunteers').some(v => v['모집ID'] === 'RCT-0002' && v['회원ID'] === 'MEM-0001' && v['상태'] === '신청' && v['인정시간'] === 3 && v['활동일'] === plus(12)));
  check('내 봉사 신청 중 목록에 표시, 누적시간은 그대로(완료만 집계)', r.app.volunteer.pending.length === 1 && r.app.volunteer.totalHours === 24);
  check('캘린더에 봉사 일정 포함', r.app.scheduleEvents.some(e => e.kind === 'volunteer' && e.date === plus(12)));
  check('같은 봉사 중복 신청 거절', /이미 참여 신청/.test(throws(() => g.run("applyVolunteer('RCT-0002')")) || ''));
  check('없는 모집 거절', /존재하지 않는/.test(throws(() => g.run("applyVolunteer('RCT-9999')")) || ''));
  g.run("applyVolunteer('RCT-0001')");               // 김미숙: 잔여 2 → 1
  asMember('MEM-0005', 'daeun@test.com');
  g.run("applyVolunteer('RCT-0001')");               // 정다은: 잔여 1 → 0
  asMember('MEM-0003', 'park@test.com');
  check('모집 인원이 차면 신청 거절', /모두 찼습니다/.test(throws(() => g.run("applyVolunteer('RCT-0001')")) || ''));
  g.run(`updateRecord_('recruits','모집ID','RCT-0002',{'마감일':parseDate_('${plus(-1)}')})`);
  check('마감일이 지난 모집은 마감으로 거절', /모집이 마감/.test(throws(() => g.run("applyVolunteer('RCT-0002')")) || ''));
  as('');
  check('쓰기 함수 결과에 Date 객체 없음', !hasDate(g.run('getAppData()')));
}

// ================= 2. 화면 (가상 브라우저) =================
console.log('\n[2] 화면 (가상 브라우저)');

async function mountApp(opts = {}) {
  const f = createContext(DIR, FILES);
  f.run('setupSheets();');
  if (opts.sample !== false) f.run('insertSampleData();');
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const calls = [];
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push(e.message));
  w.scrollTo = () => {};
  function makeRunner(ok, bad) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return h => makeRunner(h, bad);
        if (prop === 'withFailureHandler') return h => makeRunner(ok, h);
        return (...args) => {
          calls.push(prop);
          setTimeout(() => {
            try {
              const res = f.ctx[prop](...JSON.parse(JSON.stringify(args)));
              if (hasDate(res)) errors.push('Date in result of ' + prop);
              ok && ok(res === undefined ? undefined : JSON.parse(JSON.stringify(res)));
            } catch (e) { bad && bad({ message: e.message }); }
          }, 5);
        };
      }
    });
  }
  w.google = { script: { get run() { return makeRunner(null, null); } } };
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  check('index.html 안에 스크립트가 한 덩어리로 들어 있음 (외부 파일 없음)', scripts.length > 5000 && !/<script[^>]+src=/.test(html));
  w.eval(scripts);
  const $ = id => w.document.getElementById(id);
  const q = s => w.document.querySelector(s);
  const qa = s => [...w.document.querySelectorAll(s)];
  const wait = (ms = 60) => new Promise(r => setTimeout(r, ms));
  const click = async el => { el.click(); await wait(); };
  return { f, w, $, q, qa, calls, errors, wait, click };
}

async function homeAndPrograms() {
  const { f, w, $, q, qa, calls, errors, wait, click } = await mountApp();
  await wait(80);

  check('처음 열면 getAppData 한 번 호출', calls[0] === 'getAppData' && calls.length === 1);
  check('로딩 표시는 끝나서 숨겨짐', $('loading').hidden === true);
  check('홈: 인사말에 이름과 "어르신" 호칭', /김미숙 어르신/.test(q('h1').textContent));
  check('홈: 미리보기 안내 표시', !!q('.demo'));
  check('홈: 오늘의 일정 카드에 요가교실', /은빛 활력 요가교실/.test(q('.today-box').textContent));
  check('홈: 신청·수강 2건 / 봉사 24시간', /2/.test(q('.stat').textContent) && /24/.test(qa('.stat')[1].textContent));
  check('홈: 하단 탭 "홈"이 현재 위치', q('.tab[data-tab="home"]').getAttribute('aria-current') === 'page');
  check('홈: 추천 강좌 카드(마감임박 관절체조)와 복지소식 3건', /근력 쑥쑥/.test(q('.prog').textContent) && qa('.qrow').length >= 3 + 3);
  check('홈: 전화 연결 링크가 숫자만으로 만들어짐', q('a[href^="tel:"]').getAttribute('href') === 'tel:0212345678');

  // 글자 크기
  await click(q('.pill-btn'));
  check('글자 크기 버튼: 보통 → 크게 (18px)', w.document.documentElement.style.fontSize === '18px' && $('font-label').textContent === '크게');

  // 프로그램 탭
  await click(q('.tab[data-tab="programs"]'));
  check('프로그램 탭 이동, 6개 강좌 표시', qa('article.prog').length === 6 && /총 6개 강좌/.test($('prog-count').textContent));
  const card = id => q(`article.prog[data-program="${id}"]`);
  check('상태 문구: 접수중 잔여 7석 / 마감임박 / 정원 마감 / 접수 마감', /접수중 · 잔여 7석/.test(card('PRG-0001').textContent) && /마감임박 · 잔여 2석/.test(card('PRG-0002').textContent) && /정원 마감 · 대기 2명/.test(card('PRG-0003').textContent) && /접수 마감/.test(card('PRG-0004').textContent));
  check('버튼 문구: 간편 신청 / 대기 신청(3번째) / 신청 완료 · 내 활동 보기', /간편 신청하기/.test(card('PRG-0001').textContent) && /대기 신청하기 \(현재 3번째 대기\)/.test(card('PRG-0003').textContent) && /신청 완료 · 내 활동 보기/.test(card('PRG-0004').textContent));

  // 분류·검색
  await click(q('.fchip[data-cat="건강/운동"]'));
  check('분류 "건강/운동" → 2개', qa('article.prog').length === 2 && /총 2개/.test($('prog-count').textContent) && q('.fchip[data-cat="건강/운동"]').getAttribute('aria-pressed') === 'true');
  await click(q('.fchip[data-cat="전체"]'));
  $('q').value = '요가';
  $('q').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('검색 "요가" → 1개, 검색어 지우기 버튼 나타남', qa('article.prog').length === 1 && $('q-clear').hidden === false);
  $('q').value = '없는강좌';
  $('q').dispatchEvent(new w.Event('input', { bubbles: true }));
  check('검색 결과 없음 안내', /조건에 맞는 강좌가 없어요/.test($('prog-list').textContent) && /총 0개/.test($('prog-count').textContent));
  await click($('q-clear'));
  check('검색어 지우기 → 전체 복귀', qa('article.prog').length === 6 && $('q').value === '');

  // 음성안내(이 환경엔 음성 합성이 없어 안내 알림)
  await click(q('[data-action="readPrograms"]'));
  check('음성 합성이 없는 기기에서는 안내 알림', /음성 안내를 쓸 수 없어요/.test($('toast').textContent) && $('toast').className.indexOf('err') >= 0);

  // 수강 신청
  await click(card('PRG-0001').querySelector('[data-action="apply"]'));
  check('신청 확인 창이 열림 (강좌·시간·장소·신청자 정보)', !!q('.sheet') && /시니어 스마트폰/.test(q('.sheet').textContent) && /매주 화·목 10:00 ~ 11:30/.test(q('.sheet').textContent) && /김미숙 회원님/.test(q('.sheet').textContent) && /010-3849-\*\*\*\*/.test(q('.sheet').textContent));
  check('신청 확인 창: 본문 스크롤 잠금 + 확인 버튼에 포커스', w.document.body.classList.contains('noscroll') && w.document.activeElement.getAttribute('data-action') === 'confirmApply');
  await click(q('[data-action="closeSheet"].btn'));
  check('취소를 누르면 창이 닫힘 (서버 호출 없음)', !q('.sheet') && !calls.includes('applyProgram'));
  await click(card('PRG-0001').querySelector('[data-action="apply"]'));
  q('.backdrop').click();
  check('바깥(어두운 배경)을 누르면 창이 닫힘', !q('.sheet'));
  await click(card('PRG-0001').querySelector('[data-action="apply"]'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  check('Esc 키로 창이 닫힘', !q('.sheet'));
  await click(card('PRG-0001').querySelector('[data-action="apply"]'));
  await click(q('[data-action="confirmApply"]'));
  await wait(40);
  check('신청 완료 알림 + 창 닫힘 + 로딩 숨김', /수강 신청이 완료/.test($('toast').textContent) && !q('.sheet') && $('loading').hidden === true);
  check('카드가 "신청 완료"로 바뀌고 잔여석 감소', /신청 완료 · 내 활동 보기/.test(card('PRG-0001').textContent) && /잔여 6석/.test(card('PRG-0001').textContent));
  check('시트에도 반영', f.run("readTable_('enrollments')").some(e => e['프로그램ID'] === 'PRG-0001' && e['회원ID'] === 'MEM-0001'));

  // 대기 신청
  await click(card('PRG-0003').querySelector('[data-action="apply"]'));
  check('대기 신청 확인 창은 안내 문구 포함', /정원이 모두 찼어요/.test(q('.sheet').textContent));
  await click(q('[data-action="confirmApply"]'));
  await wait(40);
  check('대기 신청 완료 알림(3번째) + 카드가 "대기 중"', /3번째/.test($('toast').textContent) && /대기 중 \(3번째\)/.test(card('PRG-0003').textContent));

  check('프로그램 화면 동안 브라우저 오류 없음', errors.length === 0, errors);
  return { f, w, $, q, qa, calls, errors, wait, click };
}

async function communityFlow(ctx) {
  const { f, w, $, q, qa, calls, errors, wait, click } = ctx;
  await click(q('.tab[data-tab="community"]'));
  const post = id => q(`article.post[data-post="${id}"]`);
  check('어울림 마당: 오늘의 마을 한마디 카드 + 같은 글을 뺀 5개 목록', qa('article.post').length === 5 && /오늘 봄바람이 참 좋네요/.test(q('.today-say').textContent) && !post('PST-0002'), qa('article.post').length);
  check('글 카드에 작성자·시간·구분·좋아요/댓글 수', /박영희/.test(post('PST-0001').textContent) && /2시간 전/.test(post('PST-0001').textContent) && /따뜻해요 3/.test(post('PST-0001').textContent) && /댓글 2/.test(post('PST-0001').textContent));

  await click(post('PST-0001').querySelector('[data-action="like"]'));
  check('좋아요 누르면 4로 늘고 활성 표시', /따뜻해요 4/.test(post('PST-0001').textContent) && post('PST-0001').querySelector('.act.on') !== null);
  await click(post('PST-0001').querySelector('[data-action="like"]'));
  check('다시 누르면 3으로 줄고 활성 해제', /따뜻해요 3/.test(post('PST-0001').textContent) && post('PST-0001').querySelector('.act.on') === null);

  // 댓글
  await click(post('PST-0001').querySelector('[data-action="toggleComments"]'));
  check('댓글 보기: 기존 댓글 2개 + 입력칸', post('PST-0001').querySelectorAll('.cmt').length === 2 && !!post('PST-0001').querySelector('[data-draft]'));
  const before = calls.filter(c => c === 'addComment').length;
  await click(post('PST-0001').querySelector('[data-action="sendComment"]'));
  check('빈 댓글은 서버로 보내지 않고 안내', /댓글 내용을 입력/.test($('toast').textContent) && calls.filter(c => c === 'addComment').length === before);
  const input = post('PST-0001').querySelector('[data-draft]');
  input.value = '정말 따뜻한 작품이네요';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await click(post('PST-0001').querySelector('[data-action="like"]')); // 다시 그려져도 입력 중이던 글이 남는지
  check('다시 그려져도 쓰던 댓글이 유지됨', post('PST-0001').querySelector('[data-draft]').value === '정말 따뜻한 작품이네요');
  await click(post('PST-0001').querySelector('[data-action="sendComment"]'));
  check('댓글 등록 → 3개, 입력칸 비워짐', post('PST-0001').querySelectorAll('.cmt').length === 3 && /정말 따뜻한 작품이네요/.test(post('PST-0001').textContent) && post('PST-0001').querySelector('[data-draft]').value === '');

  // 읽어주기
  await click(post('PST-0001').querySelector('[data-action="readPost"]'));
  check('글 읽어주기: 음성 합성이 없으면 안내 알림', /음성 안내를 쓸 수 없어요/.test($('toast').textContent));

  // 글쓰기
  await click(q('[data-action="compose"]'));
  check('글쓰기 창: 종류 3가지(공지 제외) + 제목 + 내용', qa('#c-type option').length === 3 && !/공지/.test($('c-type').textContent) && !!$('c-title') && !!$('c-content'));
  await click(q('[data-action="sendPost"]'));
  check('내용 없이 올리면 안내하고 창 유지', /내용을 입력/.test($('toast').textContent) && !!q('.sheet'));
  await click(q('[data-action="dictate"]'));
  check('말로 쓰기: 음성 인식이 없으면 안내 알림', /말로 쓰기를 쓸 수 없어요/.test($('toast').textContent));
  $('c-type').value = '재능나눔';
  $('c-title').value = '기타 쳐 드려요';
  $('c-content').value = '<b>굵게</b><img src=x onerror="window.__xss=1"> 기타 연주 들려드려요';
  await click(q('[data-action="sendPost"]'));
  await wait(40);
  check('글 올리기 성공: 창 닫힘 + 맨 위에 새 글', !q('.sheet') && /기타 쳐 드려요/.test(qa('article.post')[0].textContent) && /재능나눔/.test(qa('article.post')[0].textContent));
  check('HTML이 섞인 글도 글자 그대로 보임 (스크립트·이미지 실행 안 됨)', /<b>굵게<\/b>/.test(qa('article.post')[0].textContent) && !qa('article.post')[0].querySelector('img') && ![...qa('article.post')[0].querySelectorAll('b')].some(b => b.textContent === '굵게') && w.__xss === undefined);

  // 필터
  await click(q('.fchip[data-type="공지"]'));
  check('글 종류 "공지" 필터 → 1개, 오늘의 마을 한마디 숨김', qa('article.post').length === 1 && /건강검진/.test(q('article.post').textContent) && !q('.today-say'));
  await click(q('.fchip[data-type="전체"]'));

  // 봉사
  await click(q('.seg button[data-seg="volunteer"]'));
  check('봉사 보기: 모집 2건, 마감임박 문구', qa('.vol-card').length === 2 && /마감 D-2/.test(qa('.vol-card')[0].textContent) && /남은 자리 2명/.test(qa('.vol-card')[0].textContent));
  await click(qa('.vol-card')[1].querySelector('[data-action="volApply"]'));
  await wait(40);
  check('봉사 신청 완료 → 버튼이 "참여 신청 완료"(비활성)', /봉사 참여 신청이 완료/.test($('toast').textContent) && /참여 신청 완료/.test(qa('.vol-card')[1].textContent) && qa('.vol-card')[1].querySelector('button').disabled === true);

  check('어울림 마당 동안 브라우저 오류 없음', errors.length === 0, errors);
}

async function myFlow(ctx) {
  const { f, w, $, q, qa, calls, errors, wait, click } = ctx;
  await click(q('.tab[data-tab="my"]'));
  check('마이 활동: 프로필(이름·등급·나이·동네)', /김미숙 어르신/.test(q('.profile').textContent) && /열정회원/.test(q('.profile').textContent) && /당산동/.test(q('.profile').textContent));
  check('마이 활동: 통계 — 수강 3건(요가·원예·스마트폰, 대기 제외) / 봉사 24시간 / 작성한 글 2개', /3건/.test(qa('.mystat')[0].textContent) && /24시간/.test(qa('.mystat')[1].textContent) && /2개/.test(qa('.mystat')[2].textContent), qa('.mystat').map(x => x.textContent));

  check('오늘의 일정에 출석체크 버튼', !!q('[data-action="checkin"]') && /은빛 활력 요가교실/.test(q('.session').textContent));
  await click(q('[data-action="checkin"]'));
  await wait(40);
  check('출석 완료 알림 + 버튼이 "오늘 출석 완료"로 바뀜', /출석이 완료/.test($('toast').textContent) && /오늘 출석 완료/.test(q('.session').textContent) && !q('[data-action="checkin"]'));

  // 내 신청 프로그램
  const enr = id => q(`article.enr[data-enr="${id}"]`);
  check('내 신청 카드: 수강 진행중 (3회/총회차) + 진행률 막대', /수강 진행중 \(3회\//.test(enr('ENR-0001').textContent) && !!enr('ENR-0001').querySelector('[role="progressbar"]'));
  check('내 신청 카드: 개강 대기 + 개강일', qa('article.enr').some(e => /개강 대기/.test(e.textContent) && /개강/.test(e.textContent)));
  check('내 신청 카드: 대기 중(3번째)', qa('article.enr').some(e => /대기 중 \(3번째\)/.test(e.textContent)));

  // 캘린더
  const month = new Date().getFullYear() + '-' + pad(new Date().getMonth() + 1);
  const todayCell = q('.cal-cell.today');
  check('캘린더: 오늘 칸이 강조되고 수업 점이 찍힘', !!todayCell && todayCell.querySelector('.dots i') !== null && todayCell.getAttribute('data-date') === TODAY);
  await click(todayCell);
  check('날짜를 누르면 그날 일정이 아래에 나타남', /일정/.test(q('.day-list').textContent) && /은빛 활력 요가교실/.test(q('.day-list').textContent));
  await click(q('.cal-cell.sel'));
  check('같은 날짜를 다시 누르면 선택 해제', !q('.day-list'));
  const monthTitle = () => q('.cal-head h2').textContent;
  const t0 = monthTitle();
  await click(q('[data-action="calNext"]'));
  check('다음 달로 이동', monthTitle() !== t0);
  await click(q('[data-action="calPrev"]'));
  check('이전 달로 돌아옴', monthTitle() === t0);

  // 신청 취소
  await click(enr('ENR-0002').querySelector('[data-action="openCancel"]'));
  check('취소 확인 창에 강좌명과 안내', /원예 테라피/.test(q('.sheet').textContent) && /자리가 다른 분께 넘어가요/.test(q('.sheet').textContent));
  await click(q('.sheet [data-action="closeSheet"].btn'));
  check('"그대로 두기"를 누르면 아무 변화 없음', !calls.includes('cancelApplication') && !!enr('ENR-0002'));
  await click(enr('ENR-0002').querySelector('[data-action="openCancel"]'));
  await click(q('[data-action="confirmCancel"]'));
  await wait(40);
  check('신청 취소 완료 → 카드가 사라짐', /취소되었습니다/.test($('toast').textContent) && !enr('ENR-0002'));
  await click(qa('article.enr').find(e => /대기 중/.test(e.textContent)).querySelector('[data-action="openCancel"]'));
  check('대기 취소 창은 "대기 취소" 문구', /대기 신청을 취소할까요/.test(q('.sheet').textContent));
  await click(q('[data-action="confirmCancel"]'));
  await wait(40);
  check('대기 취소 완료', !qa('article.enr').some(e => /대기 중/.test(e.textContent)));

  // 봉사 기록
  check('봉사 기록: 누적 24시간, 1365 연계, 최근 내역, 신청 중 봉사', /24 시간/.test(q('.big-num').textContent) && /1365 연계 완료/.test(w.document.body.textContent) && /어르신 밑반찬 배달 사랑나눔/.test(w.document.body.textContent) && /신청 완료/.test(w.document.body.textContent));

  // 글자 크기 설정
  await click(q('.fontseg button[data-level="2"]'));
  check('글자 크기 "아주 크게" → 20px, 버튼 눌림 표시', w.document.documentElement.style.fontSize === '20px' && q('.fontseg button[data-level="2"]').getAttribute('aria-pressed') === 'true' && $('font-label').textContent === '아주 크게');

  check('마이 활동 동안 브라우저 오류 없음', errors.length === 0, errors);
}

async function errorFlow() {
  const m = await mountApp({ sample: false });
  await m.wait(80);
  check('회원이 없으면 오류 안내 + 다시 시도 버튼', !!m.q('.error-box') && /등록된 회원이 없습니다/.test(m.q('.error-box').textContent) && !!m.q('[data-action="retry"]'));
  check('오류 상태에서도 하단 탭은 보임', m.qa('.tab').length === 4);
  m.f.run('insertSampleData()');
  await m.click(m.q('[data-action="retry"]'));
  await m.wait(60);
  check('데이터를 넣고 다시 시도하면 정상 화면', !m.q('.error-box') && /김미숙/.test(m.q('h1').textContent));

  // 화면이 열려 있는 사이 강좌가 폐강된 경우: 서버가 거절하면 알림만 띄우고 화면은 그대로
  await m.click(m.q('.tab[data-tab="programs"]'));
  await m.click(m.q('[data-action="apply"][data-id="PRG-0002"]'));
  check('(준비) 신청 확인 창이 열려 있음', !!m.q('.sheet'));
  m.f.run(`updateRecord_('programs','프로그램ID','PRG-0002',{'상태':'폐강'})`);
  await m.click(m.q('[data-action="confirmApply"]'));
  await m.wait(40);
  check('서버가 거절하면 빨간 알림만 뜨고 로딩은 꺼짐', /폐강/.test(m.$('toast').textContent) && m.$('toast').className.indexOf('err') >= 0 && m.$('loading').hidden === true);
  check('에러 흐름 동안 브라우저 스크립트 오류 없음', m.errors.length === 0, m.errors);
}

Promise.resolve()
  .then(homeAndPrograms)
  .then(async ctx => { await communityFlow(ctx); return ctx; })
  .then(async ctx => { await myFlow(ctx); })
  .then(errorFlow)
  .then(() => {
    console.log(`\n결과: 통과 ${pass} / 실패 ${fail}`);
    process.exit(fail ? 1 : 0);
  })
  .catch(e => { console.error(e); process.exit(1); });
