/**
 * 프로그램(강좌): 화면용 데이터 만들기, 수강 신청·대기·취소, 출석 체크
 * 정원 확인과 저장은 withLock_ 안에서 해서 동시에 신청해도 정원이 넘치지 않는다.
 */

/**
 * 강좌 한 건을 화면용으로 바꾼다.
 * state: open(접수중) / closing(마감임박, 잔여 CLOSING_SOON_LEFT석 이하) / full(정원 마감, 대기 가능) / closed(개강 후 접수 마감)
 * myStatus: 내가 신청한 상태('신청완료'/'대기', 없으면 ''), myWaitNo: 내 대기 번호
 */
function programView_(p, t, meId, today) {
  const id = str_(p['프로그램ID']);
  const enr = t.enrollments.filter(function (e) { return str_(e['프로그램ID']) === id; });
  const enrolled = enr.filter(function (e) { return e['상태'] === ENROLL.OK; }).length;
  const waiting = enr.filter(function (e) { return e['상태'] === ENROLL.WAIT; }).length;
  const capacity = num_(p['정원'], 0);
  const remaining = Math.max(0, capacity - enrolled);
  const start = str_(p['시작일']);
  const end = str_(p['종료일']);

  let state = 'open';
  if (start && today > start) state = 'closed';
  else if (remaining === 0) state = 'full';
  else if (remaining <= CLOSING_SOON_LEFT) state = 'closing';

  const mine = enr.filter(function (e) { return str_(e['회원ID']) === meId && e['상태'] !== ENROLL.CANCEL; })[0];
  const days = parseDays_(p['요일']);
  const startTime = str_(p['시작시간']);
  const endTime = str_(p['종료시간']);

  return {
    id: id,
    category: str_(p['분류']),
    title: str_(p['강좌명']),
    subtitle: str_(p['부제']),
    target: str_(p['대상']),
    fee: str_(p['수강료']),
    startDate: start,
    endDate: end,
    days: days,
    startTime: startTime,
    endTime: endTime,
    timeText: (days.length ? '매주 ' + days.join('·') + ' ' : '') + (startTime ? startTime + (endTime ? ' ~ ' + endTime : '') : ''),
    place: str_(p['장소']),
    instructor: str_(p['강사']),
    capacity: capacity,
    notes: str_(p['안내사항']),
    enrolled: enrolled,
    remaining: remaining,
    waiting: waiting,
    state: state,
    myEnrollmentId: mine ? str_(mine['신청ID']) : '',
    myStatus: mine ? mine['상태'] : '',
    myWaitNo: mine && mine['상태'] === ENROLL.WAIT ? num_(mine['대기번호'], 0) : 0
  };
}

/** 내 신청 내역(신청완료·대기). 출석 횟수와 진행률 포함 */
function buildMyEnrollments_(t, meId, today) {
  const programsById = indexBy_(t.programs, '프로그램ID');
  const out = [];
  t.enrollments.forEach(function (e) {
    if (str_(e['회원ID']) !== meId || e['상태'] === ENROLL.CANCEL) return;
    const p = programsById[str_(e['프로그램ID'])];
    if (!p) return;
    const view = programView_(p, t, meId, today);
    const sessions = sessionDates_(view.startDate, view.endDate, p['요일']);
    const attended = t.attendance.filter(function (a) { return str_(a['신청ID']) === str_(e['신청ID']); }).length;
    const next = sessions.filter(function (d) { return d >= today; })[0] || '';
    out.push({
      id: str_(e['신청ID']),
      status: e['상태'],
      waitNo: num_(e['대기번호'], 0),
      appliedAt: str_(e['신청일시']),
      program: view,
      attended: attended,
      totalSessions: sessions.length,
      progress: sessions.length ? Math.min(100, Math.round(attended / sessions.length * 1000) / 10) : 0,
      nextSession: next,
      started: !!view.startDate && today >= view.startDate
    });
  });
  out.sort(function (a, b) { return a.program.startDate < b.program.startDate ? -1 : a.program.startDate > b.program.startDate ? 1 : 0; });
  return out;
}

/** 수강 신청. 정원이 남아 있으면 '신청완료', 다 찼으면 '대기'로 등록한다. */
function applyProgram(programId) {
  let message = '';
  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const p = t.programs.filter(function (x) { return str_(x['프로그램ID']) === str_(programId); })[0];
    if (!p || str_(p['상태']) === '폐강') throw new Error('존재하지 않거나 폐강된 강좌입니다.');

    const view = programView_(p, t, me.id, today_());
    if (view.myStatus) throw new Error('이미 ' + (view.myStatus === ENROLL.WAIT ? '대기 신청' : '신청') + '하신 강좌입니다.');
    if (view.state === 'closed') throw new Error('접수가 마감된 강좌입니다.');

    const waiting = view.remaining === 0;
    const waitNo = waiting ? view.waiting + 1 : '';
    appendRecords_('enrollments', [{
      '신청ID': nextId_('enrollments'),
      '프로그램ID': view.id,
      '회원ID': me.id,
      '신청일시': nowStr_(),
      '상태': waiting ? ENROLL.WAIT : ENROLL.OK,
      '대기번호': waitNo,
      '비고': ''
    }]);
    message = waiting
      ? '대기 신청이 완료되었습니다. 현재 ' + waitNo + '번째 대기입니다.'
      : '수강 신청이 완료되었습니다!';
  });
  return { message: message, app: getAppData() };
}

/** 신청·대기 취소. 신청완료를 취소하면 대기 1번이 자동으로 신청완료로 올라간다. */
function cancelApplication(enrollmentId) {
  let message = '';
  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const e = t.enrollments.filter(function (x) { return str_(x['신청ID']) === str_(enrollmentId); })[0];
    if (!e) throw new Error('신청 내역을 찾을 수 없습니다.');
    if (str_(e['회원ID']) !== me.id) throw new Error('본인의 신청만 취소할 수 있습니다.');
    if (e['상태'] === ENROLL.CANCEL) throw new Error('이미 취소된 신청입니다.');

    const wasOk = e['상태'] === ENROLL.OK;
    const programId = str_(e['프로그램ID']);
    updateRecord_('enrollments', '신청ID', str_(e['신청ID']), { '상태': ENROLL.CANCEL, '대기번호': '' });

    let promoted = false;
    if (wasOk) promoted = promoteFirstWaiting_(programId);
    renumberWaitlist_(programId);
    message = '신청이 취소되었습니다.' + (promoted ? ' (대기 1번 분께 자리가 넘어갔어요)' : '');
  });
  return { message: message, app: getAppData() };
}

/** 대기 1번을 신청완료로 올린다. 올렸으면 true */
function promoteFirstWaiting_(programId) {
  const waiting = readTable_('enrollments')
    .filter(function (e) { return str_(e['프로그램ID']) === str_(programId) && e['상태'] === ENROLL.WAIT; })
    .sort(waitOrder_);
  if (!waiting.length) return false;
  updateRecord_('enrollments', '신청ID', str_(waiting[0]['신청ID']), {
    '상태': ENROLL.OK, '대기번호': '', '비고': '대기 순번으로 자동 등록'
  });
  return true;
}

function waitOrder_(a, b) {
  const an = num_(a['대기번호'], 9999);
  const bn = num_(b['대기번호'], 9999);
  if (an !== bn) return an - bn;
  return byTimeThenId_(a, b, '신청일시', '신청ID', 1);
}

/** 대기자 번호를 1, 2, 3 … 으로 다시 매긴다. */
function renumberWaitlist_(programId) {
  readTable_('enrollments')
    .filter(function (e) { return str_(e['프로그램ID']) === str_(programId) && e['상태'] === ENROLL.WAIT; })
    .sort(waitOrder_)
    .forEach(function (e, i) {
      if (num_(e['대기번호'], 0) !== i + 1) updateRecord_('enrollments', '신청ID', str_(e['신청ID']), { '대기번호': i + 1 });
    });
}

/** 오늘 수업 출석 체크. 수강 중인 강좌의 수업이 있는 날에만, 하루에 한 번만 된다. */
function checkIn(enrollmentId) {
  let message = '';
  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const today = today_();
    const e = t.enrollments.filter(function (x) { return str_(x['신청ID']) === str_(enrollmentId); })[0];
    if (!e || str_(e['회원ID']) !== me.id) throw new Error('본인의 수강 내역이 아닙니다.');
    if (e['상태'] !== ENROLL.OK) throw new Error('수강 신청이 완료된 강좌만 출석할 수 있습니다.');
    const p = t.programs.filter(function (x) { return str_(x['프로그램ID']) === str_(e['프로그램ID']); })[0];
    if (!p || !isSessionDay_(p, today)) throw new Error('오늘은 이 강좌의 수업이 있는 날이 아닙니다.');
    const already = t.attendance.some(function (a) { return str_(a['신청ID']) === str_(e['신청ID']) && str_(a['출석일']) === today; });
    if (already) throw new Error('오늘은 이미 출석하셨습니다.');

    appendRecords_('attendance', [{
      '출석ID': nextId_('attendance'),
      '신청ID': str_(e['신청ID']),
      '회원ID': me.id,
      '출석일': parseDate_(today),
      '출석일시': nowStr_()
    }]);
    message = '출석이 완료되었습니다. 오늘도 즐거운 시간 되세요!';
  });
  return { message: message, app: getAppData() };
}
