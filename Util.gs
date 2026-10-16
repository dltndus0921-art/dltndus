/**
 * 날짜·문자열 도우미. 날짜는 모두 'yyyy-MM-dd' 문자열, 일시는 'yyyy-MM-dd HH:mm:ss' 문자열로 다룬다.
 */

const WEEKDAYS = '일월화수목금토';

function tz_() { return Session.getScriptTimeZone(); }

function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function nowStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }

function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function num_(v, fallback) {
  const n = Number(v);
  return v === '' || v === null || v === undefined || isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
}

/** 'yyyy-MM-dd' 문자열을 날짜로 바꾼다. 형식이 틀리면 null */
function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

function addDays_(dateStr, n) {
  const d = parseDate_(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}

/** toStr - fromStr 일수. 형식이 틀리면 null */
function daysBetween_(fromStr, toStr) {
  const a = parseDate_(fromStr);
  const b = parseDate_(toStr);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function weekdayChar_(dateStr) {
  const d = parseDate_(dateStr);
  return d ? WEEKDAYS.charAt(d.getDay()) : '';
}

/** "화,목" "월·수·금" 같은 요일 글자에서 요일 한 글자씩 뽑는다. */
function parseDays_(text) {
  return String(text || '').match(/[월화수목금토일]/g) || [];
}

/** 시작일~종료일 중 요일이 맞는 날짜 목록. 비정상적으로 긴 기간은 366일까지만 본다. */
function sessionDates_(startStr, endStr, daysText) {
  const days = parseDays_(daysText);
  const out = [];
  if (!days.length || !parseDate_(startStr) || !parseDate_(endStr)) return out;
  let cur = startStr;
  for (let i = 0; i < 366 && cur <= endStr; i++) {
    if (days.indexOf(weekdayChar_(cur)) >= 0) out.push(cur);
    cur = addDays_(cur, 1);
  }
  return out;
}

/** 이 날짜(dateStr)에 수업이 있는 강좌인지 */
function isSessionDay_(program, dateStr) {
  const start = str_(program['시작일']);
  const end = str_(program['종료일']);
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return parseDays_(program['요일']).indexOf(weekdayChar_(dateStr)) >= 0;
}

/** 'yyyy-MM-dd HH:mm:ss' → "방금 전 / N분 전 / N시간 전 / 어제 / N일 전 / 날짜" */
function agoText_(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ''));
  if (!m) return str_(ts).slice(0, 10);
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  const minutes = Math.floor((new Date() - then) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return minutes + '분 전';
  if (minutes < 60 * 24) return Math.floor(minutes / 60) + '시간 전';
  if (minutes < 60 * 48) return '어제';
  if (minutes < 60 * 24 * 30) return Math.floor(minutes / (60 * 24)) + '일 전';
  return m[1] + '-' + m[2] + '-' + m[3];
}

/** 일시로 정렬하고, 같은 초에 생긴 것은 ID 순서로 가른다. dir: 1=오래된 것부터, -1=최신부터 */
function byTimeThenId_(a, b, timeField, idField, dir) {
  const at = str_(a[timeField]);
  const bt = str_(b[timeField]);
  if (at !== bt) return (at < bt ? -1 : 1) * dir;
  const ai = str_(a[idField]);
  const bi = str_(b[idField]);
  return ai === bi ? 0 : (ai < bi ? -1 : 1) * dir;
}

/** 010-3849-1234 → 010-3849-**** */
function maskPhone_(p) {
  const s = str_(p);
  const m = /^(.*?)(\d{4})$/.exec(s);
  return m ? m[1] + '****' : s;
}
