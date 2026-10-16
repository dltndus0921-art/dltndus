/**
 * 어울림 마당: 글 목록 만들기, 글쓰기, 좋아요, 댓글
 * '공지'는 복지관 직원이 05_DB_게시글 탭에 직접 입력한다(회원은 쓸 수 없음).
 */

const MAX_POSTS_SHOWN = 60;
const MAX_COMMENTS_SHOWN = 30;

/** 게시 중인 글을 최신순으로, 좋아요·댓글과 함께 화면용으로 바꾼다. */
function buildPosts_(t, meId) {
  const likeCount = {};
  const likedByMe = {};
  t.likes.forEach(function (l) {
    if (l['상태'] !== '좋아요') return;
    const pid = str_(l['글ID']);
    likeCount[pid] = (likeCount[pid] || 0) + 1;
    if (str_(l['회원ID']) === meId) likedByMe[pid] = true;
  });

  const commentsByPost = {};
  t.comments
    .slice()
    .sort(function (a, b) { return byTimeThenId_(a, b, '작성일시', '댓글ID', 1); })
    .forEach(function (c) {
      const pid = str_(c['글ID']);
      (commentsByPost[pid] = commentsByPost[pid] || []).push({
        id: str_(c['댓글ID']),
        author: str_(c['작성자표시']),
        content: str_(c['내용']),
        ago: agoText_(c['작성일시']),
        isMine: str_(c['작성자ID']) === meId
      });
    });

  return t.posts
    .filter(function (p) { return str_(p['상태']) === '게시'; })
    .sort(function (a, b) { return byTimeThenId_(a, b, '작성일시', '글ID', -1); })
    .slice(0, MAX_POSTS_SHOWN)
    .map(function (p) {
      const id = str_(p['글ID']);
      const comments = commentsByPost[id] || [];
      return {
        id: id,
        type: str_(p['구분']),
        author: str_(p['작성자표시']),
        neighborhood: str_(p['동네']),
        title: str_(p['제목']),
        content: str_(p['내용']),
        createdAt: str_(p['작성일시']),
        ago: agoText_(p['작성일시']),
        likeCount: likeCount[id] || 0,
        likedByMe: !!likedByMe[id],
        commentCount: comments.length,
        comments: comments.slice(-MAX_COMMENTS_SHOWN),
        isMine: str_(p['작성자ID']) === meId,
        isNotice: str_(p['구분']) === '공지'
      };
    });
}

/** 글쓰기. form: { type, title, content } */
function createPost(form) {
  const f = form || {};
  const type = str_(f.type) || WRITABLE_POST_TYPES[0];
  if (WRITABLE_POST_TYPES.indexOf(type) < 0) throw new Error('올릴 수 없는 글 종류입니다: ' + type);
  const content = str_(f.content);
  const title = str_(f.title);
  if (!content) throw new Error('내용을 입력해 주세요.');
  if (content.length > MAX_POST_LENGTH) throw new Error('내용은 ' + MAX_POST_LENGTH + '자까지 쓸 수 있어요. (현재 ' + content.length + '자)');
  if (title.length > MAX_TITLE_LENGTH) throw new Error('제목은 ' + MAX_TITLE_LENGTH + '자까지 쓸 수 있어요.');

  withLock_(function () {
    const me = requireMe_();
    appendRecords_('posts', [{
      '글ID': nextId_('posts'),
      '구분': type,
      '작성자ID': me.id,
      '작성자표시': me.name,
      '동네': str_(me.row['동네']),
      '제목': title,
      '내용': content,
      '작성일시': nowStr_(),
      '상태': '게시'
    }]);
  });
  return { message: '이야기가 올라갔어요. 고맙습니다!', app: getAppData() };
}

/** 좋아요 켜기/끄기. 같은 회원은 글마다 한 번만 누를 수 있다. */
function toggleLike(postId) {
  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const post = t.posts.filter(function (p) { return str_(p['글ID']) === str_(postId) && str_(p['상태']) === '게시'; })[0];
    if (!post) throw new Error('글을 찾을 수 없습니다.');
    const row = t.likes.filter(function (l) { return str_(l['글ID']) === str_(postId) && str_(l['회원ID']) === me.id; })[0];
    if (row) {
      updateRecord_('likes', '좋아요ID', str_(row['좋아요ID']), {
        '상태': row['상태'] === '좋아요' ? '취소' : '좋아요',
        '일시': nowStr_()
      });
    } else {
      appendRecords_('likes', [{
        '좋아요ID': nextId_('likes'), '글ID': str_(postId), '회원ID': me.id, '상태': '좋아요', '일시': nowStr_()
      }]);
    }
  });
  return { message: '', app: getAppData() };
}

/** 댓글 쓰기 */
function addComment(postId, text) {
  const content = str_(text);
  if (!content) throw new Error('댓글 내용을 입력해 주세요.');
  if (content.length > MAX_COMMENT_LENGTH) throw new Error('댓글은 ' + MAX_COMMENT_LENGTH + '자까지 쓸 수 있어요.');

  withLock_(function () {
    const t = readAll_();
    const me = requireMe_(t);
    const post = t.posts.filter(function (p) { return str_(p['글ID']) === str_(postId) && str_(p['상태']) === '게시'; })[0];
    if (!post) throw new Error('글을 찾을 수 없습니다.');
    appendRecords_('comments', [{
      '댓글ID': nextId_('comments'),
      '글ID': str_(postId),
      '작성자ID': me.id,
      '작성자표시': me.name,
      '내용': content,
      '작성일시': nowStr_()
    }]);
  });
  return { message: '댓글을 남겼어요.', app: getAppData() };
}
