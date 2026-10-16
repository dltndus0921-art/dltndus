/**
 * 온마을 복지관 앱의 진입점과 화면 데이터 조립.
 * - 프론트엔드(index.html 한 파일)는 google.script.run으로 이 파일의 함수들을 부른다.
 * - 화면에 필요한 모든 데이터는 getAppData() 한 번으로 받고,
 *   신청·글쓰기 같은 쓰기 함수도 결과로 최신 getAppData()를 돌려줘서 화면이 바로 갱신된다.
 * - 기능별 쓰기 함수: Programs.gs(강좌 신청·취소·출석), Community.gs(글·댓글·좋아요), Volunteer.gs(봉사 신청)
 */

function doGet() {
  return buildApp_().setTitle(CENTER.name);
}

function buildApp_() {
  return HtmlService.createHtmlOutputFromFile('index')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// ---------- 현재 사용자(회원) 찾기 ----------

/**
 * 접속한 구글 계정 이메일로 01_DB_회원의 회원을 찾는다.
 * 이메일이 일치하는 회원이 없으면 첫 번째 회원을 "미리보기 회원"으로 쓴다(demo=true).
 * 회원이 한 명도 없으면 null.
 */
function getMe_(members) {
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { email = ''; }
  const list = members || readTable_('members');
  if (email) {
    const hit = list.filter(function (m) { return str_(m['이메일']).toLowerCase() === email; })[0];
    if (hit) return { member: hit, demo: false };
  }
  return list.length ? { member: list[0], demo: true } : null;
}

function requireMe_(t) {
  const info = getMe_(t ? t.members : null);
  if (!info) throw new Error('등록된 회원이 없습니다. 시트 메뉴 "온마을복지관 → 예시 데이터 넣기"를 실행하거나 01_DB_회원 탭에 회원을 입력하세요.');
  return { id: str_(info.member['회원ID']), name: str_(info.member['성명']), row: info.member, demo: info.demo };
}

// ---------- 화면 데이터 ----------

/** 화면 전체에 필요한 데이터를 한 번에 만든다. */
function getAppData() {
  const t = readAll_();
  const me = requireMe_(t);
  const today = today_();

  const programs = t.programs
    .filter(function (p) { return str_(p['상태']) !== '폐강' && (!str_(p['종료일']) || str_(p['종료일']) >= today); })
    .map(function (p) { return programView_(p, t, me.id, today); })
    .sort(function (a, b) { return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0; });

  const myEnrollments = buildMyEnrollments_(t, me.id, today);
  const volunteer = buildVolunteerSummary_(t, me.id);
  const myPosts = t.posts.filter(function (p) { return str_(p['작성자ID']) === me.id && str_(p['상태']) === '게시'; }).length;
  const age = num_(me.row['출생연도'], 0) ? Number(today.slice(0, 4)) - num_(me.row['출생연도'], 0) : null;

  return {
    center: CENTER,
    categories: CATEGORIES,
    postTypes: POST_TYPES,
    writableTypes: WRITABLE_POST_TYPES,
    today: { date: today, weekday: weekdayChar_(today) },
    demo: me.demo,
    me: {
      id: me.id,
      name: me.name,
      age: age,
      neighborhood: str_(me.row['동네']),
      grade: str_(me.row['회원등급']),
      phone: maskPhone_(me.row['연락처'])
    },
    stats: {
      enrolled: myEnrollments.filter(function (e) { return e.status === ENROLL.OK; }).length,
      volunteerHours: volunteer.totalHours,
      posts: myPosts
    },
    todaySessions: buildTodaySessions_(t, me.id, today),
    programs: programs,
    myEnrollments: myEnrollments,
    posts: buildPosts_(t, me.id),
    recruits: buildRecruits_(t, me.id, today),
    volunteer: volunteer,
    scheduleEvents: buildScheduleEvents_(t, me.id, today)
  };
}

function buildTodaySessions_(t, meId, today) {
  const programsById = indexBy_(t.programs, '프로그램ID');
  const out = [];
  t.enrollments.forEach(function (e) {
    if (str_(e['회원ID']) !== meId || e['상태'] !== ENROLL.OK) return;
    const p = programsById[str_(e['프로그램ID'])];
    if (!p || str_(p['상태']) === '폐강' || !isSessionDay_(p, today)) return;
    const attended = t.attendance.some(function (a) { return str_(a['신청ID']) === str_(e['신청ID']) && str_(a['출석일']) === today; });
    out.push({
      enrollmentId: str_(e['신청ID']),
      programId: str_(p['프로그램ID']),
      title: str_(p['강좌명']),
      startTime: str_(p['시작시간']),
      endTime: str_(p['종료시간']),
      place: str_(p['장소']),
      attended: attended
    });
  });
  out.sort(function (a, b) { return a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0; });
  return out;
}

/** 내 일정 캘린더용: 오늘 기준 -40일 ~ +120일 안의 수업·봉사 날짜 */
function buildScheduleEvents_(t, meId, today) {
  const from = addDays_(today, -40);
  const to = addDays_(today, 120);
  const programsById = indexBy_(t.programs, '프로그램ID');
  const events = [];
  t.enrollments.forEach(function (e) {
    if (str_(e['회원ID']) !== meId || e['상태'] !== ENROLL.OK) return;
    const p = programsById[str_(e['프로그램ID'])];
    if (!p || str_(p['상태']) === '폐강') return;
    sessionDates_(str_(p['시작일']), str_(p['종료일']), p['요일']).forEach(function (d) {
      if (d >= from && d <= to) events.push({ date: d, kind: 'class', title: str_(p['강좌명']), time: str_(p['시작시간']) });
    });
  });
  t.volunteers.forEach(function (v) {
    if (str_(v['회원ID']) !== meId || (v['상태'] !== '신청' && v['상태'] !== '완료')) return;
    const d = str_(v['활동일']);
    if (d && d >= from && d <= to) events.push({ date: d, kind: 'volunteer', title: str_(v['활동명']), time: '' });
  });
  return events;
}

function indexBy_(rows, field) {
  const map = {};
  rows.forEach(function (r) { map[str_(r[field])] = r; });
  return map;
}
