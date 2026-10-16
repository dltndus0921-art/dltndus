/**
 * DB 시트 구조 정의 (헤더 = 1행)
 * 코드에서는 열 번호 대신 헤더 이름으로 접근한다.
 * textColumns: 시간("10:00")·연락처·일시가 날짜/숫자로 자동 변환되지 않도록 텍스트 형식으로 고정할 열
 */

const SCHEMA = {
  members: {
    sheet: '01_DB_회원',
    headers: ['회원ID', '성명', '출생연도', '동네', '연락처', '이메일', '회원등급', '가입일'],
    textColumns: ['연락처']
  },
  programs: {
    sheet: '02_DB_프로그램',
    headers: [
      '프로그램ID', '분류', '강좌명', '부제', '대상', '수강료', '시작일', '종료일',
      '요일', '시작시간', '종료시간', '장소', '강사', '정원', '안내사항', '상태'
    ],
    textColumns: ['요일', '시작시간', '종료시간']
  },
  enrollments: {
    sheet: '03_DB_수강신청',
    headers: ['신청ID', '프로그램ID', '회원ID', '신청일시', '상태', '대기번호', '비고'],
    textColumns: ['신청일시']
  },
  attendance: {
    sheet: '04_DB_출석',
    headers: ['출석ID', '신청ID', '회원ID', '출석일', '출석일시'],
    textColumns: ['출석일시']
  },
  posts: {
    sheet: '05_DB_게시글',
    headers: ['글ID', '구분', '작성자ID', '작성자표시', '동네', '제목', '내용', '작성일시', '상태'],
    textColumns: ['작성일시']
  },
  comments: {
    sheet: '06_DB_댓글',
    headers: ['댓글ID', '글ID', '작성자ID', '작성자표시', '내용', '작성일시'],
    textColumns: ['작성일시']
  },
  likes: {
    sheet: '07_DB_좋아요',
    headers: ['좋아요ID', '글ID', '회원ID', '상태', '일시'],
    textColumns: ['일시']
  },
  recruits: {
    sheet: '08_DB_봉사모집',
    headers: ['모집ID', '제목', '설명', '일자', '시작시간', '인정시간', '장소', '모집인원', '마감일', '상태'],
    textColumns: ['시작시간']
  },
  volunteers: {
    sheet: '09_DB_봉사참여',
    headers: ['참여ID', '모집ID', '회원ID', '활동명', '활동일', '인정시간', '상태', '1365연계', '신청일시'],
    textColumns: ['신청일시']
  }
};

// 복지관 기본 정보 (화면 상단·전화 연결 버튼에 사용)
const CENTER = { name: '온마을 복지관', phone: '02-1234-5678' };

// 강좌 분류 (프로그램 화면 칩 순서)
const CATEGORIES = ['건강/운동', '디지털/교육', '문화/여가', '어르신 특화', '자원봉사'];

// 어울림 마당 글 구분. 회원이 쓸 수 있는 것은 앞의 3개, '공지'는 복지관 직원이 시트에 직접 입력한다.
const POST_TYPES = ['일상소통', '재능나눔', '도움요청', '공지'];
const WRITABLE_POST_TYPES = ['일상소통', '재능나눔', '도움요청'];

const ENROLL = { OK: '신청완료', WAIT: '대기', CANCEL: '취소' };
const CLOSING_SOON_LEFT = 2;       // 잔여석이 이 값 이하이면 "마감임박"
const RECRUIT_CLOSING_DAYS = 3;    // 봉사 모집 마감이 이 일수 이내이면 "마감 D-n" 강조
const MAX_POST_LENGTH = 1000;
const MAX_COMMENT_LENGTH = 300;
const MAX_TITLE_LENGTH = 40;

const ID_PREFIX = {
  members: 'MEM-', programs: 'PRG-', enrollments: 'ENR-', attendance: 'ATT-',
  posts: 'PST-', comments: 'CMT-', likes: 'LKE-', recruits: 'RCT-', volunteers: 'VOL-'
};
const ID_FIELD = {
  members: '회원ID', programs: '프로그램ID', enrollments: '신청ID', attendance: '출석ID',
  posts: '글ID', comments: '댓글ID', likes: '좋아요ID', recruits: '모집ID', volunteers: '참여ID'
};
