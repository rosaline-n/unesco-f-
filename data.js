/* =========================================================
   data.js — 공용 보관함(구글 시트) 연결
   ---------------------------------------------------------
   하는 일 3가지
     1. 기기마다 '끝까지 플레이한 첫 판' 1회를 익명으로 보낸다
     2. 모두의 통계를 받아온다 (P2 '다른 사람들은?' · 연구 노트)
     3. 스페셜 엔딩의 답변과 상품 응모를 보낸다

   ⚠️ 쓰기 전에 아래 SHEET_URL을 자기 주소로 바꿔야 한다.
      바꾸는 방법은 '구글시트_설치방법.txt'에 적어 놓았다.
      주소를 안 바꿔도 게임은 그대로 돌아간다. 통계만 안 보인다.

   개인정보 원칙
     · 플레이 기록에는 이름·연락처가 절대 들어가지 않는다 (아래 makeRecord 참고)
     · 학번·이름·연락처는 상품 응모에 따로 동의한 사람만, 다른 탭에 저장된다
     · 내 이메일 주소는 이 파일에 쓰지 않는다 (구글 시트 쪽 코드에만 있다)
   ========================================================= */
'use strict';

// ↓↓↓ 여기를 자기 주소로 바꾸기 ↓↓↓
const SHEET_URL = '';
// ↑↑↑ 예: 'https://script.google.com/macros/s/AKfycb..../exec' ↑↑↑

const GAME_VERSION = '1.0';

/*
   통계를 보여주기 시작하는 최소 인원.
   사람이 적을 때 "100%가 이걸 골랐습니다" 같은 말이 나오면 안 되니까 10명으로 막아 둔다.
   주소 끝에 ?peek 를 붙이면 1명부터 보인다 (제작자가 화면을 확인할 때만 쓰는 스위치).
*/
const PEEK = new URLSearchParams(location.search).has('peek');
const MIN_STATS = PEEK ? 1 : 10;


/* ---------- 폰 안에 저장하기 ---------- */
// 저장이 막힌 브라우저(사생활 보호 모드 등)에서도 게임이 멈추지 않도록 try로 감쌌다.
const store = {
  get(name, fallback) {
    try {
      const saved = localStorage.getItem('orvia.' + name);
      return saved === null ? fallback : JSON.parse(saved);
    } catch (e) {
      return fallback;
    }
  },
  set(name, value) {
    try { localStorage.setItem('orvia.' + name, JSON.stringify(value)); } catch (e) {}
  },
  del(name) {
    try { localStorage.removeItem('orvia.' + name); } catch (e) {}
  },
};

// 이 기기를 구별하는 무작위 번호. 누구인지는 알 수 없고, 같은 기기인지만 안다.
function deviceId() {
  let id = store.get('deviceId', null);
  if (!id) {
    id = 'd' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    store.set('deviceId', id);
  }
  return id;
}


/* ---------- 보관함에 말 걸기 ---------- */

// 주소가 비어 있으면 아예 시도하지 않는다 (게임은 그대로 돌아감)
function sheetReady() { return typeof SHEET_URL === 'string' && SHEET_URL.startsWith('http'); }

/*
   구글 시트에 보내고 답을 받는다.
   ms 안에 답이 없으면 포기한다 (인터넷이 느려도 게임이 멈추지 않게).
*/
async function callSheet(payload, ms = 8000) {
  if (!sheetReady()) throw new Error('보관함 주소가 아직 설정되지 않았어요');
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    const res = await fetch(SHEET_URL, {
      method: 'POST',
      // Content-Type을 text/plain으로 두면 브라우저가 미리 확인 요청을 보내지 않아
      // 구글 앱스 스크립트와 바로 통신할 수 있다
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: stop.signal,
      redirect: 'follow',
    });
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error(data && data.error || '보관함이 거절했어요');
    return data;
  } finally {
    clearTimeout(timer);
  }
}


/* ---------- 1. 첫 판 기록 보내기 ---------- */

/*
   보내는 것은 이 표가 전부다. 이름·학번·연락처는 들어가지 않는다.
     device  : 무작위 기기 번호
     q1~q4   : 고른 선택
     ending  : 도달한 엔딩
     path    : 걸어온 길 (연구 노트의 '나와 같은 길' 통계용)
     vars    : 마지막 수치 4개 (정당성과 평화의 관계, 전교생의 지구를 그리는 데 쓴다)
     seen    : 열어 본 분쟁 지역 코드 (어느 분쟁에 관심이 많았는지 통계용)
*/
function makeRecord(game, ending) {
  const c = game.choices;
  const v = game.vars;
  return {
    action: 'play',
    device: deviceId(),
    version: GAME_VERSION,
    q1: c.q1 || '', q2: c.q2 || '', q3: c.q3 || '',
    c1: c.c1 || '', c2: c.c2 || '', c3: c.c3 || '', c4: c.c4 || '',
    ending,
    path: [c.q1, c.q2, c.q3, c.c1, c.c2, c.c3, c.c4].filter(Boolean).join('>'),
    peace: v.peace, coop: v.coop, legit: v.legit, trust: v.trust,
    seen: (game.seen || []).slice(0, 20).join(','),
  };
}

/*
   엔딩 화면에 도착했을 때 부른다.
   첫 판이 아니면 아무것도 보내지 않는다.
   돌려주는 값: { sent: 보냈나, first: 첫 판이었나, rank: 이 엔딩에 도달한 몇 번째인지 }
*/
async function recordPlay(game, ending) {
  if (store.get('firstPlayDone', false) === true) return { sent: false, first: false };

  const record = makeRecord(game, ending);
  store.set('firstPlayDone', true);     // 두 번 보내지 않도록 먼저 표시
  store.set('myPath', record.path);

  try {
    const res = await callSheet(record);
    store.del('pendingRecord');
    if (res.rank) store.set('myRank', { ending, rank: res.rank });
    return { sent: true, first: true, rank: res.rank };
  } catch (e) {
    // 인터넷이 안 되면 저장해 두었다가 다음에 게임을 열 때 다시 보낸다
    store.set('pendingRecord', record);
    return { sent: false, first: true };
  }
}

// 게임을 열 때 한 번 부른다. 지난번에 못 보낸 기록이 있으면 조용히 다시 보낸다.
async function retryPending() {
  const record = store.get('pendingRecord', null);
  if (!record || !sheetReady()) return;
  try {
    const res = await callSheet(record);
    store.del('pendingRecord');
    if (res.rank) store.set('myRank', { ending: record.ending, rank: res.rank });
  } catch (e) { /* 다음에 다시 시도 */ }
}


/* ---------- 2. 통계 받아오기 ---------- */

let statsCache = null;      // 게임 도중에는 다시 불러오지 않는다 (인터넷이 느려도 안 멈추게)

async function loadStats(force = false) {
  if (statsCache && !force) return statsCache;
  if (!sheetReady()) return null;
  try {
    statsCache = await callSheet({ action: 'stats' }, 9000);
    return statsCache;
  } catch (e) {
    return null;
  }
}

/*
   어떤 질문에서 내가 고른 답을 전체의 몇 %가 골랐는지.
   10명 미만이면 null (아직 데이터를 모으는 중)
*/
function sharePercent(key, value) {
  if (!statsCache || !statsCache[key]) return null;
  const counts = statsCache[key];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < MIN_STATS) return { few: true, total };
  return { percent: Math.round((counts[value] || 0) / total * 100), total, counts };
}


/* ---------- 3. 답변과 상품 응모 보내기 ---------- */

/*
   answer : 열린 질문에 쓴 글 (익명, 플레이 기록과 연결하지 않는다)
   entry  : 상품에 응모할 때만 { sid, name, contact }. 응모하지 않으면 null
*/
async function sendAnswer(answer, entry) {
  const payload = { action: 'answer', answer: String(answer || '').slice(0, 300) };
  if (entry) {
    payload.entry = {
      sid: String(entry.sid || '').slice(0, 10),
      name: String(entry.name || '').slice(0, 20),
      contact: String(entry.contact || '').slice(0, 40),
    };
  }
  const res = await callSheet(payload, 12000);
  if (entry) store.set('entrySent', true);
  store.set('answerSent', true);
  return res;
}
