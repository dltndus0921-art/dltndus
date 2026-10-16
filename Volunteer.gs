/**
 * 자원봉사: 모집 목록, 참여 신청, 내 봉사 기록
 * 활동이 끝나면 복지관 직원이 09_DB_봉사참여 탭에서 상태를 '완료'로 바꾸고 인정시간·1365연계를 입력한다.
 */

/**
 * 봉사 모집 한 건을 화면용으로 바꾼다.
 * state: open / closing(마감 RECRUIT_CLOSING_DAYS일 이내) / full(모집 인원 마감) / closed(마감일 지남 또는 모집 종료)
 */
function recruitView_(r, t, meId, today) {
  const id = str_(r['모집ID']);
  const rows = t.volunteers.filter(function (v) {
    return str_(v['모집ID']) === id && (v['상태'] === '신청' || v['상태'] === '완료');
  });
  const capacity = num_(r['모집인원'], 0);
  const remaining = Math.max(0, capacity - rows.length);
  const deadline = str_(r['마감일']);
  const dDay = deadline ? daysBetween_(today, deadline) : null;
  const mine = rows.filter(function (v) { return str_(v['회원ID']) === meId; })[0];

  let state = 'open';
  if (str_(r['상태']) === '마감' || (dDay !== null && dDay < 0)) state = 'closed';
  else if (remaining === 0) state = 'full';
  else if (dDay !== null && dDay <= RECRUIT_CLOSING_DAYS) state = 'closing';

  return {
    id: id,
    title: str_(r['제목']),
    description: str_(r['설명']),
    date: str_(r['일자']),
    startTime: str_(r['시작시간']),
    hours: num_(r['인정시간'], 0),
    place: str_(r['장소']),
    capacity: capacity,
    applied: rows.length,
    remaining: remaining,
    deadline: deadline,
    dDay: dDay,
    state: state,
    myStatus: mine ? mine['상태'] : ''
  };
}

/** 앞으로 있을(또는 오늘) 봉사 모집을 일자 순으로 */
function buildRecruits_(t, meId, today) {
  return t.recruits
    .filter(function (r) { return str_(r['상태']) !== '취소' && (!str_(r['일자']) || str_(r['일자']) >= today); })
    .map(function (r) { return recruitView_(r, t, meId, today); })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

/** 내 봉사 기록: 완료된 활동의 누적 시간과 최근 내역, 신청 중인 활동 */
function buildVolunteerSummary_(t, meId) {
  const mine = t.volunteers.filter(function (v) { return str_(v['회원ID']) === meId; });
  const done = mine.filter(function (v) { return v['상태'] === '완료'; })
    .sort(function (a, b) { return str_(a['활동일']) < str_(b['활동일']) ? 1 : -1; });
  const totalHours = done.reduce(function (sum, v) { return sum + num_(v['인정시간'], 0); }, 0);
  return {
    totalHours: Math.round(totalHours * 10) / 10,
    linked1365: done.some(function (v) { return str_(v['1365연계']).toUpperCase() === 'Y'; }),
    logs: done.slice(0, 5).map(function (v) {
      return { id: str_(v['참여ID']), title: str_(v['활동명']), date: str_(v['활동일']), hours: num_(v['인정시간'], 0) };
    }),
    pending: mine.filter(function (v) { return v['상태'] === '신청'; }).map(function (v) {
      return { id: str_(v['참여ID']), title: str_(v['활동명']), date: str_(v['활동일']), hours: num_(v['인정시간'], 0) };
    })
  };
}

/** 봉사 참여 신청 */
function applyVolunteer(recruitId) {
  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const r = t.recruits.filter(function (x) { return str_(x['모집ID']) === str_(recruitId); })[0];
    if (!r || str_(r['상태']) === '취소') throw new Error('존재하지 않는 봉사 모집입니다.');
    const view = recruitView_(r, t, me.id, today_());
    if (view.myStatus) throw new Error('이미 참여 신청하셨습니다.');
    if (view.state === 'closed') throw new Error('모집이 마감되었습니다.');
    if (view.state === 'full') throw new Error('모집 인원이 모두 찼습니다.');

    appendRecords_('volunteers', [{
      '참여ID': nextId_('volunteers'),
      '모집ID': view.id,
      '회원ID': me.id,
      '활동명': view.title,
      '활동일': parseDate_(view.date) || '',
      '인정시간': view.hours,
      '상태': '신청',
      '1365연계': 'N',
      '신청일시': nowStr_()
    }]);
  });
  return { message: '봉사 참여 신청이 완료되었습니다. 따뜻한 마음 감사합니다!', app: getAppData() };
}
