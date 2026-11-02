/* =========================================================
   apps-script.gs — 구글 시트에 붙여넣는 코드
   ---------------------------------------------------------
   이 코드는 게임 폴더가 아니라 '구글 스프레드시트' 안에서 돈다.
   설치 방법은 '구글시트_설치방법.txt'를 보세요.

   하는 일
     1. 게임이 보낸 첫 판 기록을 '기록' 탭에 저장
     2. 통계를 계산해서 게임에 돌려줌
     3. 스페셜 엔딩 답변을 '답변' 탭에, 상품 응모를 '응모' 탭에 저장
     4. 응모가 들어오면 내 지메일로 알림 보내기
     5. 상품 지급 후 1년이 지난 응모 정보를 자동으로 지움

   개인정보 원칙
     · '기록' 탭에는 이름·학번·연락처가 들어가지 않는다
     · '응모' 탭은 '기록' 탭과 연결되지 않는다 (기기 번호를 저장하지 않음)
     · 통계로 내보내는 것은 합계 숫자뿐이다 (한 사람의 기록은 절대 안 나감)
   ========================================================= */

/* 알림 메일을 받을 주소. 비워 두면 이 시트 주인의 지메일로 간다. */
var ALERT_EMAIL = '';

var TAB_PLAY   = '기록';
var PLAY_HEADERS = ['시각', '기기번호', 'q1', 'q2', 'q3', 'c1', 'c2', 'c3', 'c4', '엔딩', '경로', '버전',
                    '평화', '협력', '정당성', '국내신뢰도', '본분쟁'];
var ANSWER_HEADERS = ['시각', '답변', '공개'];   // '공개' 칸에 O를 적으면 연구 노트에 익명으로 보인다
var TAB_ANSWER = '답변';
var TAB_ENTRY  = '응모';

/* 게임이 보낼 수 있는 값만 받는다 (장난으로 보낸 값은 저장하지 않는다) */
var ALLOWED = {
  q1: ['gov', 'nogov'],
  q2: ['force', 'consent', 'alone', 'partner'],
  q3: ['suppress', 'negotiate'],
  c1: ['powers', 'all'],
  c2: ['gov', 'multi'],
  c3: ['ignore', 'graduated', 'sanction'],
  c4: ['fast', 'ratify'],
  ending: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9']
};


/* ---------- 게임이 말을 걸면 여기로 들어온다 ---------- */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'play')   return reply(savePlay(body));
    if (body.action === 'stats')  return reply(buildStats());
    if (body.action === 'answer') return reply(saveAnswer(body));
    return reply({ ok: false, error: 'unknown action' });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

/* 주소창으로 열어도 통계를 볼 수 있게 (잘 설치됐는지 확인할 때 편하다) */
function doGet() {
  return reply(buildStats());
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ---------- 1. 첫 판 기록 저장 ---------- */

function savePlay(body) {
  var sheet = tab(TAB_PLAY, PLAY_HEADERS);

  // 값 검사 — 목록에 없는 값이면 저장하지 않는다
  var keys = ['q1', 'q2', 'q3', 'c1', 'c2', 'c3', 'c4'];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], v = body[k];
    if (v && ALLOWED[k].indexOf(v) === -1) return { ok: false, error: 'bad value' };
  }
  if (ALLOWED.ending.indexOf(body.ending) === -1) return { ok: false, error: 'bad ending' };

  var device = String(body.device || '').slice(0, 40);
  if (!device) return { ok: false, error: 'no device' };

  // 같은 기기가 두 번 보내면 저장하지 않는다 (첫 판만 모으기 위해)
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var devices = sheet.getLastRow() > 1
      ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues()
      : [];
    for (var j = 0; j < devices.length; j++) {
      if (devices[j][0] === device) return { ok: true, duplicate: true };
    }

    sheet.appendRow([
      new Date(), device,
      body.q1 || '', body.q2 || '', body.q3 || '',
      body.c1 || '', body.c2 || '', body.c3 || '', body.c4 || '',
      body.ending, String(body.path || '').slice(0, 80), String(body.version || ''),
      num(body.peace), num(body.coop), num(body.legit), num(body.trust),
      String(body.seen || '').slice(0, 200)
    ]);
    CacheService.getScriptCache().remove('stats');   // 통계를 새로 계산하게

    // 이 엔딩에 도달한 몇 번째 사람인지 세어서 돌려준다 ('n번째 개척자')
    var endings = sheet.getRange(2, 10, sheet.getLastRow() - 1, 1).getValues();
    var rank = 0;
    for (var m = 0; m < endings.length; m++) if (endings[m][0] === body.ending) rank++;
    return { ok: true, rank: rank };
  } finally {
    lock.releaseLock();
  }
}


/* ---------- 2. 통계 계산 ---------- */

function buildStats() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('stats');
  if (hit) return JSON.parse(hit);

  var sheet = tab(TAB_PLAY, PLAY_HEADERS);
  var last = sheet.getLastRow();
  var out = {
    ok: true, total: 0,
    q1: {}, q2: {}, q3: {}, c1: {}, c2: {}, c3: {}, c4: {}, ending: {}, path: {},
    avg: null,          // 전교생 평균 수치 (전교생이 함께 만든 지구)
    legitBand: {},      // 정당성 구간별 평균 평화
    byChoice: {},       // 선택지별 평균 결과
    conflicts: {},      // 사람들이 열어 본 분쟁 지역
    picked: []          // '공개' 칸에 O를 적은 답변
  };

  if (last > 1) {
    // q1 ~ 본분쟁 (3번째 칸부터 15칸)
    var rows = sheet.getRange(2, 3, last - 1, 15).getValues();
    var names = ['q1', 'q2', 'q3', 'c1', 'c2', 'c3', 'c4', 'ending', 'path'];
    var sum = { peace: 0, coop: 0, legit: 0, trust: 0 }, numbered = 0;
    out.total = rows.length;

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      // ① 선택 수 세기
      for (var c = 0; c < names.length; c++) {
        var v = row[c];
        if (v === '' || v === null) continue;
        var bucket = out[names[c]];
        bucket[v] = (bucket[v] || 0) + 1;
      }
      // ② 마지막 수치
      var peace = row[10], coop = row[11], legit = row[12], trust = row[13];
      var hasNums = peace !== '' && peace !== null && !isNaN(Number(peace));
      if (hasNums) {
        numbered++;
        sum.peace += Number(peace); sum.coop += Number(coop);
        sum.legit += Number(legit); sum.trust += Number(trust);

        // 정당성 구간별 평균 평화
        var band = legitBandName(Number(legit));
        if (!out.legitBand[band]) out.legitBand[band] = { n: 0, peace: 0 };
        out.legitBand[band].n++;
        out.legitBand[band].peace += Number(peace);

        // 선택지별 평균 결과
        for (var k = 0; k < 7; k++) {
          var key = names[k], val = row[k];
          if (!val) continue;
          if (!out.byChoice[key]) out.byChoice[key] = {};
          if (!out.byChoice[key][val]) out.byChoice[key][val] = { n: 0, peace: 0, coop: 0, legit: 0 };
          var b = out.byChoice[key][val];
          b.n++; b.peace += Number(peace); b.coop += Number(coop); b.legit += Number(legit);
        }
      }
      // ③ 열어 본 분쟁 지역
      var seen = String(row[14] || '').split(',');
      for (var m = 0; m < seen.length; m++) {
        var id = seen[m].trim();
        if (id) out.conflicts[id] = (out.conflicts[id] || 0) + 1;
      }
    }

    if (numbered >= 1) {
      out.avg = {
        n: numbered,
        peace: Math.round(sum.peace / numbered), coop: Math.round(sum.coop / numbered),
        legit: Math.round(sum.legit / numbered), trust: Math.round(sum.trust / numbered)
      };
    }
    // 합계를 평균으로 바꾸기
    for (var bn in out.legitBand) {
      out.legitBand[bn].peace = Math.round(out.legitBand[bn].peace / out.legitBand[bn].n);
    }
    for (var ck in out.byChoice) {
      for (var cv in out.byChoice[ck]) {
        var o = out.byChoice[ck][cv];
        o.peace = Math.round(o.peace / o.n); o.coop = Math.round(o.coop / o.n); o.legit = Math.round(o.legit / o.n);
      }
    }
  }

  out.picked = pickedAnswers();
  out.updated = Utilities.formatDate(new Date(), 'Asia/Seoul', 'HH:mm');
  cache.put('stats', JSON.stringify(out), 60);     // 1분 동안은 다시 계산하지 않는다
  return out;
}

function legitBandName(v) {
  if (v < 20) return '0-19';
  if (v < 40) return '20-39';
  if (v < 60) return '40-59';
  if (v < 80) return '60-79';
  return '80-100';
}

/*
   '답변' 탭의 '공개' 칸에 O(또는 아무 글자)를 적은 답변만 연구 노트에 익명으로 보여 준다.
   아무것도 안 적으면 어떤 답변도 공개되지 않는다.
*/
function pickedAnswers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_ANSWER);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues();   // 답변, 공개
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim() && rows[i][0]) {
      out.push(String(rows[i][0]).slice(0, 300));
      if (out.length >= 12) break;
    }
  }
  return out;
}


/* ---------- 3. 답변과 상품 응모 저장 ---------- */

function saveAnswer(body) {
  var answer = String(body.answer || '').slice(0, 300);
  var entry = body.entry;

  // 답변은 익명으로 저장한다 (플레이 기록과 연결하지 않는다)
  if (answer) {
    tab(TAB_ANSWER, ANSWER_HEADERS).appendRow([new Date(), answer, '']);
  }

  // 상품 응모에 동의한 사람만 따로 저장한다
  if (entry && entry.name && entry.contact) {
    var sheet = tab(TAB_ENTRY, ['시각', '학번', '이름', '연락처', '답변', '상품지급일', '삭제예정일']);
    sheet.appendRow([
      new Date(),
      String(entry.sid || '').slice(0, 10),
      String(entry.name || '').slice(0, 20),
      String(entry.contact || '').slice(0, 40),
      answer, '', ''
    ]);
    notify(entry, answer);
  }
  return { ok: true };
}

/* 응모가 들어오면 메일로 알려 준다 */
function notify(entry, answer) {
  try {
    var to = ALERT_EMAIL || Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: '[ORVIA] 새 상품 응모 — ' + entry.name,
      body: '학번: ' + entry.sid + '\n이름: ' + entry.name + '\n연락처: ' + entry.contact +
            '\n\n답변:\n' + answer +
            '\n\n(응모 정보는 상품 지급 후 1년 뒤 자동으로 지워집니다. ' +
            '응모 탭의 "상품지급일" 칸에 날짜를 적어 두세요.)'
    });
  } catch (err) { /* 메일이 안 가도 응모는 저장된다 */ }
}


/* ---------- 4. 상품 지급 후 1년이 지난 응모 정보 지우기 ---------- */
/*
   하루에 한 번 저절로 돌게 하려면 아래 setupTrigger를 한 번만 실행하면 된다.
   '상품지급일' 칸이 비어 있으면 지우지 않는다 (아직 상품을 안 준 사람).
   익명 플레이 기록은 지우지 않는다 (연구 노트 통계를 위해 계속 보관).
*/
function cleanOldEntries() {
  var sheet = tab(TAB_ENTRY, ['시각', '학번', '이름', '연락처', '답변', '상품지급일', '삭제예정일']);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rows = sheet.getRange(2, 6, last - 1, 1).getValues();   // 상품지급일 칸
  var now = new Date();
  for (var i = rows.length - 1; i >= 0; i--) {
    var given = rows[i][0];
    if (!given) continue;
    var when = new Date(given);
    if (isNaN(when.getTime())) continue;
    var year = 365 * 24 * 60 * 60 * 1000;
    if (now - when > year) sheet.deleteRow(i + 2);
  }
}

function setupTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'cleanOldEntries') ScriptApp.deleteTrigger(all[i]);
  }
  ScriptApp.newTrigger('cleanOldEntries').timeBased().everyDays(1).atHour(4).create();
}


/* ---------- 도움 함수 ---------- */

/* 0~100 사이 숫자만 받는다 (장난으로 보낸 값은 빈칸으로) */
function num(v) {
  var n = Number(v);
  if (isNaN(n) || n < 0 || n > 100) return '';
  return Math.round(n);
}

/* 탭이 없으면 만들고, 첫 줄에 제목을 넣어 준다 */
function tab(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
