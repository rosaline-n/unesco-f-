/* =========================================================
   game.js — 게임 엔진
   ---------------------------------------------------------
   대본(scenes.js)과 엔딩(endings.js)을 읽어서 화면에 보여주고,
   탭과 버튼을 처리한다.
   문구·수치를 고칠 때는 이 파일을 건드리지 않아도 된다.

   차례
    1. 작은 도구들        7. 화면 하나 진행하기
    2. 팝업과 알림        8. 엔딩 화면
    3. 게이지 줄 (HUD)    9. 엔딩 도감
    4. 가운데 무대        10. 스페셜 엔딩
    5. 분쟁 카드          11. 연구 노트
    6. 멘트와 선택지      12. 처음 화면과 시작
   ========================================================= */
'use strict';

// 주소 끝에 ?fast 를 붙이면 빠른 테스트 모드 (타자 효과 없이 저절로 넘어감)
const FAST = new URLSearchParams(location.search).has('fast');
const TYPE_MS = FAST ? 0 : 30;              // 글자 하나가 나오는 시간

const ENDING_IDS = Object.keys(ENDINGS);    // ['E1' ... 'E9']

let game = null;        // 지금 하고 있는 판
let stageGlobe = null;  // 게임 화면의 지구
let homeGlobe = null;   // 처음 화면 배경의 지구


/* ---------- 1. 작은 도구들 ---------- */

function $(id) { return document.getElementById(id); }

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.type = 'button';
  return node;
}

function clamp(n) { return Math.max(0, Math.min(100, n)); }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 문장을 한 글자씩 나누기 (⚠️ 같은 이모지가 반으로 쪼개지지 않게)
function splitLetters(text) {
  if (window.Intl && Intl.Segmenter) {
    const cutter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return Array.from(cutter.segment(text), part => part.segment);
  }
  return Array.from(text);
}

/*
   한국어 조사 고르기.
   '독일' 처럼 받침이 있으면 '이', '프랑스' 처럼 없으면 '가'.
   한글은 글자 하나가 (초성, 중성, 종성)으로 이루어져 있고,
   글자 번호를 28로 나눈 나머지가 0이 아니면 받침이 있다는 뜻이다.
*/
const JOSA = { '이': ['이', '가'], '은': ['은', '는'], '을': ['을', '를'], '과': ['과', '와'] };
function josa(word, kind) {
  if (!JOSA[kind]) return kind;                      // '에서' '의' 처럼 안 바뀌는 건 그대로
  const code = word.charCodeAt(word.length - 1);
  const korean = code >= 0xAC00 && code <= 0xD7A3;
  const hasFinal = korean ? (code - 0xAC00) % 28 !== 0 : false;
  return JOSA[kind][hasFinal ? 0 : 1];
}

// 문구 안의 {독립국:이} 를 그 판에서 뽑힌 나라 이름으로 바꾼다
function fill(text) {
  if (!text || !game) return text || '';
  return text.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (whole, key, kind) => {
    const name = game.named[key];
    if (!name) return '';
    return kind ? name + josa(name, kind) : name;
  });
}

// 수치 변화를 사람이 읽는 글로: "평화 −5, 협력 +15"
function changeText(change) {
  const parts = [];
  let hidden = false;
  for (const key of Object.keys(change)) {
    if (!VARS[key]) continue;
    if (isHidden(key)) { hidden = true; continue; }
    const n = change[key];
    parts.push(`${VARS[key].name} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  if (hidden) parts.push('🔒 ??? 변동');
  return parts.join(', ');
}

// CSS 애니메이션을 처음부터 다시 틀기
function replayClass(node, className) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  node.addEventListener('animationend', function done(e) {
    if (e.target !== node) return;
    node.classList.remove(className);
    node.removeEventListener('animationend', done);
  });
}

// 판 번호. 🏠으로 나가거나 다시 하면 번호가 바뀌고, 예전 흐름은 멈춘다.
let runId = 0;
const STOP = new Error('이 판은 끝났어요');
function check(token) { if (token !== runId) throw STOP; }

async function pause(ms, token) {
  await new Promise(r => setTimeout(r, FAST ? Math.min(ms, 20) : ms));
  while (isPopupOpen()) await new Promise(r => setTimeout(r, 150));
  check(token);
}

// 화면 바꾸기 (하나만 보이고 나머지는 숨긴다)
const SCREENS = ['home', 'game', 'ending', 'collection', 'special', 'notes'];
function showScreen(name) {
  for (const id of SCREENS) $(id).hidden = (id !== name);
  const box = $(name);
  if (box) requestAnimationFrame(() => { box.scrollTop = 0; });   // 항상 맨 위부터 보이게
}


/* ---------- 2. 팝업과 알림 ---------- */

function isPopupOpen() { return !$('popup-layer').hidden; }

function openPopup({ title, body = [], buttons = [], onClose, className }) {
  const box = make('div', 'popup' + (className ? ' ' + className : ''));
  if (onClose) {
    const x = make('button', 'popup-x', '✕');
    x.setAttribute('aria-label', '닫기');
    x.onclick = onClose;
    box.append(x);
  }
  if (title) box.append(make('h2', 'popup-title', title));
  for (const part of body) box.append(typeof part === 'string' ? make('p', 'popup-text', part) : part);
  if (buttons.length) {
    const row = make('div', 'popup-buttons');
    for (const b of buttons) {
      const btn = make('button', 'btn ' + (b.kind || 'primary'), b.text);
      btn.onclick = b.onClick;
      row.append(btn);
    }
    box.append(row);
  }
  $('popup-layer').replaceChildren(box);
  $('popup-layer').hidden = false;
  return box;
}

function closePopup() {
  $('popup-layer').hidden = true;
  $('popup-layer').replaceChildren();
}

function infoPopup(title, body) {
  openPopup({ title, body, buttons: [{ text: '닫기', kind: 'secondary', onClick: closePopup }] });
}

function askPopup({ title, body, buttons, auto }) {
  return new Promise(resolve => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; closePopup(); resolve(value); };
    openPopup({ title, body, buttons: buttons.map(b => ({ ...b, onClick: () => finish(b.value) })) });
    if (FAST && auto) setTimeout(() => finish(buttons[buttons.length - 1].value), 150);
  });
}

let toastTimer = null;
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2400);
}


/* ---------- 3. 게이지 줄 (HUD) ---------- */

function gaugeCell(key) { return document.querySelector(`.gauge[data-var="${key}"]`); }

// 아직 숨겨진 변수인가? (국내 신뢰도는 C5 전까지 숨김)
function isHidden(key) { return VARS[key].hidden === true && !(game && game.trustRevealed); }

function buildGauges() {
  for (const key of Object.keys(VARS)) {
    const cell = make('button', 'gauge');
    cell.dataset.var = key;
    const top = make('span', 'g-top');
    top.append(make('span', 'g-name'), make('span', 'g-num'));
    const bar = make('span', 'g-bar');
    bar.append(make('span', 'g-fill'));
    cell.append(top, bar);
    cell.onclick = () => showTip(cell, key);
    $('gauges').append(cell);
  }
}

function setBar(cell, value, animate) {
  const fill = cell.querySelector('.g-fill');
  if (animate) { fill.style.width = value + '%'; return; }
  fill.style.transition = 'none';
  fill.style.width = value + '%';
  void fill.offsetWidth;
  fill.style.transition = '';
}

function drawGauges() {
  for (const key of Object.keys(VARS)) {
    const cell = gaugeCell(key);
    const v = VARS[key], hidden = isHidden(key);
    cell.classList.remove('shake', 'blink', 'sparkle');
    cell.classList.toggle('locked', hidden);
    cell.querySelector('.g-name').textContent = hidden ? '🔒 ???' : `${v.icon} ${v.name}`;
    cell.querySelector('.g-num').textContent = hidden ? '' : game.vars[key];
    setBar(cell, hidden ? 0 : game.vars[key], false);
  }
}

// 수치 바꾸기
function changeVars(change) {
  for (const key of Object.keys(change)) {
    if (!(key in game.vars)) { console.warn('모르는 변수 이름:', key); continue; }
    const before = game.vars[key];
    const after = clamp(before + change[key]);
    game.vars[key] = after;
    if (isHidden(key)) {
      game.trustBase = before;                  // 공개할 때 '바뀌기 직전 값'부터 보여주려고 기억
      replayClass(gaugeCell(key), 'shake');     // 🔒 칸만 살짝 흔들림
    } else {
      animateGauge(key, before, after);
    }
  }
  game.lastChange = change;
  showLastChange();
}

function animateGauge(key, from, to) {
  const cell = gaugeCell(key);
  setBar(cell, to, true);
  const num = cell.querySelector('.g-num');
  const t0 = performance.now(), dur = FAST ? 1 : 600;
  (function step(now) {
    const t = Math.max(0, Math.min(1, (now - t0) / dur));
    num.textContent = Math.round(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
  })(t0);

  const diff = to - from;
  if (!diff) return;
  const old = cell.querySelector('.g-delta');
  if (old) old.remove();
  const tag = make('span', 'g-delta ' + (diff > 0 ? 'up' : 'down'),
                   (diff > 0 ? '+' : '−') + Math.abs(diff));
  cell.append(tag);
  setTimeout(() => tag.remove(), 1600);
}

function showTip(cell, key) {
  document.querySelectorAll('.tip').forEach(t => t.remove());
  const v = VARS[key];
  const text = isHidden(key) ? '🔒 아직 발견하지 못한 변수예요' : `${v.icon} ${v.name}: ${v.tip}`;
  const tip = make('span', 'tip', text);
  cell.append(tip);
  setTimeout(() => tip.remove(), 2400);
}

// 멘트 상자 맨 위의 회색 작은 글씨 '직전 변동'
function showLastChange() {
  const box = $('last-change');
  if (!game || !game.lastChange) { box.hidden = true; return; }
  const text = changeText(game.lastChange);
  box.hidden = !text;
  box.textContent = text ? '직전 변동 · ' + text.replace(/, /g, ' · ') : '';
}

async function blinkGauge(key, token) {
  replayClass(gaugeCell(key), 'blink');
  await pause(1000, token);
}

// C5: 🔒 칸이 풀리면서 국내 신뢰도가 나타난다
async function revealTrust(info, token) {
  const cell = gaugeCell('trust');
  replayClass(cell, 'shake');
  await pause(600, token);

  game.trustRevealed = true;
  cell.classList.remove('locked');
  replayClass(cell, 'sparkle');
  cell.querySelector('.g-name').textContent = `${VARS.trust.icon} ${VARS.trust.name}`;
  cell.querySelector('.g-num').textContent = game.trustBase;
  setBar(cell, game.trustBase, false);
  await pause(900, token);

  animateGauge('trust', game.trustBase, game.vars.trust);
  await pause(1400, token);

  const body = info.lines.map(t => make('p', 'popup-text', t));
  body.push(make('p', 'popup-text note', info.note));
  await askPopup({ title: info.title, body, buttons: [{ text: info.button, value: 'ok' }], auto: true });
  check(token);
  showLastChange();        // 이제 국내 신뢰도도 글자로 보인다
}


/* ---------- 4. 가운데 무대 ---------- */

// 화면(또는 멘트)에 적힌 무대 지시를 실제 값으로 바꾼다
function resolveStage(src) {
  if (!src) return null;
  if (src.stageFn) return src.stageFn(game);
  return src.stage || null;
}

let stageView = '';
function setStage(spec, animate = true) {
  if (!spec) return false;
  let changed = false;

  if (spec.view && spec.view !== stageView) {
    stageView = spec.view;
    const meeting = spec.view === 'meeting';
    $('meeting').hidden = !meeting;
    $('stage').classList.toggle('meeting-on', meeting);
    changed = true;
  }
  if (spec.globe && stageGlobe) {
    setLook(stageGlobe, spec.globe, animate);
    changed = true;
  }
  const note = spec.note || '';
  if (note !== $('stage-note').textContent) {
    $('stage-note').textContent = note;
    $('stage-note').hidden = !note;
    changed = true;
  }
  return changed;
}

// 회의장 대표 5명의 자리
const SEATS = [
  { who: 'america', x: 13, y: 54 }, { who: 'europe', x: 30, y: 32 },
  { who: 'africa', x: 50, y: 24 }, { who: 'asia', x: 70, y: 32 },
  { who: 'oceania', x: 87, y: 54 },
];

function buildMeeting() {
  const room = $('meeting');
  room.append(make('div', 'table'));
  for (const seat of SEATS) {
    const person = SPEAKERS[seat.who];
    const node = make('div', 'seat');
    node.dataset.who = seat.who;
    node.style.left = seat.x + '%';
    node.style.top = seat.y + '%';
    node.append(make('span', 'face', person.icon),
                make('span', 'seat-name', person.name.replace(' 대표', '')));
    room.append(node);
  }
  room.append(make('div', 'chair', '🎙️ 의장 (나)'));
}

function lightSeats(list) {
  document.querySelectorAll('.seat').forEach(s => s.classList.toggle('talking', list.includes(s.dataset.who)));
}

async function playDays(labels, token) {
  const note = $('stage-note');
  note.hidden = false;
  for (const label of labels) {
    note.textContent = label;
    replayClass(note, 'tick');
    await pause(550, token);
  }
}

/* 협약 카드 */
function treatyCard() {
  const card = make('div', 'treaty-card');
  card.append(make('h3', '', TREATY.title));
  const items = make('ul', 'treaty-items');
  for (const item of TREATY.items) items.append(make('li', '', item));
  card.append(items);
  if (game.treatyNotes.length) {
    const notes = make('ul', 'treaty-notes');
    for (const n of game.treatyNotes) notes.append(make('li', '', '‣ ' + n));
    card.append(notes);
  }
  return card;
}

function openTreaty() {
  const box = $('treaty');
  box.replaceChildren(treatyCard());
  box.classList.remove('fold');
  box.hidden = false;
}

async function foldTreaty(token) {
  $('treaty').classList.add('fold');
  await pause(450, token);
  $('treaty').hidden = true;
  $('treaty-chip').hidden = false;
}


/* ---------- 5. 분쟁 카드 ---------- */

/*
   분쟁 종류에 맞는 작은 그림을 그린다.
   병사는 머리가 큰 귀여운 모습이고, 양쪽 모두 같은 크기·같은 모양이다.
   쓰러지거나 피가 보이는 연출은 없고, 누가 이겼는지도 표시하지 않는다.
   움직임은 아주 작게 (몸을 살짝 기울였다 돌아오는 정도).
*/
function conflictArt(kind, color) {
  const dot = DOT[color] || '#F28C28';
  const wrap = make('div', 'art art-' + kind);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 180 92');
  svg.setAttribute('aria-hidden', 'true');

  // x = 서 있는 자리, flip = 오른쪽을 보나, fill = 옷 색
  const person = (x, flip, fill) => `
    <g transform="translate(${x},0) scale(${flip ? -1 : 1},1)">
      <g class="fig">
        <ellipse cx="0" cy="86" rx="15" ry="3.5" fill="rgba(27,42,74,.10)"/>
        <rect x="-7" y="70" width="6" height="14" rx="3" fill="#55606E"/>
        <rect x="1" y="70" width="6" height="14" rx="3" fill="#55606E"/>
        <rect x="-11" y="46" width="22" height="28" rx="10" fill="${fill}"/>
        <rect x="8" y="50" width="15" height="7" rx="3.5" fill="${fill}" class="arm"/>
        <circle cx="0" cy="30" r="16" fill="#FFE0C2"/>
        <path d="M-16 26a16 16 0 0 1 32 0z" fill="${fill}"/>
        <rect x="-18" y="24" width="36" height="4.5" rx="2.2" fill="${fill}"/>
        <circle cx="-5.5" cy="33" r="2.1" fill="#3A3A3A"/>
        <circle cx="5.5" cy="33" r="2.1" fill="#3A3A3A"/>
        <line x1="-2.5" y1="39" x2="2.5" y2="39" stroke="#C98B6B" stroke-width="1.6" stroke-linecap="round"/>
      </g>
    </g>`;

  const left = person(56, false, dot);
  const right = person(124, true, kind === 'civil' ? '#E8A33D' : '#8C98A6');

  if (kind === 'truce') {
    // 분단·휴전: 사이에 선을 두고 가만히 서 있다
    svg.innerHTML = `<line x1="90" y1="14" x2="90" y2="84" stroke="#9BD770" stroke-width="3.5"
                       stroke-dasharray="6 6" stroke-linecap="round"/>` + left + right;
  } else if (kind === 'tension') {
    // 군사적 긴장: 서로 마주 보기만 한다
    svg.innerHTML = left + right +
      `<text x="90" y="26" text-anchor="middle" font-size="17" class="spark">⚡</text>`;
  } else {
    // 내전 · 국가 간 분쟁: 아주 조금씩 다가갔다 물러난다
    svg.innerHTML = left + right +
      `<text x="90" y="24" text-anchor="middle" font-size="15" class="spark">💥</text>`;
  }
  wrap.append(svg);
  return wrap;
}

function openConflictCard(c) {
  const body = [];
  body.push(conflictArt(c.kind, c.color));

  const head = make('div', 'card-head');
  const dot = make('span', 'card-dot');
  dot.style.background = DOT[c.color] || '#F28C28';
  head.append(dot, make('span', 'card-name', c.name));
  body.push(head);

  const rows = make('dl', 'card-rows');
  const add = (k, v) => { rows.append(make('dt', '', k), make('dd', '', v)); };
  add('구분', KIND_LABEL[c.kind] || '');
  if (c.start && c.start !== '—') add('시작', c.start);
  if (c.why) add('왜 일어났나', c.why);
  add('지금은', c.now);
  body.push(rows);
  body.push(make('p', 'card-source', '출처: ' + c.source + ' · 2026.11 기준'));

  openPopup({ body, buttons: [{ text: '닫기', kind: 'secondary', onClick: closePopup }], className: 'card' });

  // 처음 여는 분쟁이면 카운터를 올린다
  if (game && !game.seen.includes(c.id)) {
    game.seen.push(c.id);
    updateExplore();
  }
}

// W0의 '분쟁 지역 확인 0 / 2' 표시
function updateExplore() {
  const need = game && game.exploreNeed || 0;
  const box = $('explore');
  if (!need) { box.hidden = true; return; }
  const n = game.seen.length;
  box.hidden = false;
  box.textContent = n >= need ? `✓ 분쟁 지역 확인 ${need} / ${need}` : `분쟁 지역 확인 ${n} / ${need}`;
  box.classList.toggle('done', n >= need);
  const btn = $('choices').querySelector('.next-btn');
  if (btn) {
    btn.disabled = n < need;
    btn.classList.toggle('secondary', n < need);
    btn.classList.toggle('primary', n >= need);
  }
}


/* ---------- 6. 멘트와 선택지 ---------- */

let typing = null;
let waitingTap = null;

function clearDialog() {
  $('line').textContent = '';
  $('line').classList.remove('small');
  $('line').hidden = false;
  $('line-note').hidden = true;
  $('applied').hidden = true;
  $('question').hidden = true;
  $('choices').replaceChildren();
  $('choices').classList.remove('locked');
  $('speaker').hidden = true;
  $('sdg-tag').hidden = true;
  $('next-mark').hidden = true;
  lightSeats([]);
}

function showSpeaker(who) {
  const person = who ? SPEAKERS[who] : null;
  $('speaker').hidden = !person;
  $('speaker').textContent = person ? `${person.icon} ${fill(person.name)}` : '';
  lightSeats(person ? (person.seats || [who]) : []);
}

function typeText(box, text, token) {
  return new Promise(resolve => {
    const letters = splitLetters(text);
    let i = 0, timer = null;
    const finish = () => { clearTimeout(timer); typing = null; box.textContent = text; resolve(); };
    const step = () => {
      if (token !== runId) return;
      if (isPopupOpen()) { timer = setTimeout(step, 150); return; }
      if (i >= letters.length) return finish();
      box.textContent += letters[i++];
      timer = setTimeout(step, TYPE_MS);
    };
    box.textContent = '';
    if (TYPE_MS === 0) return finish();
    typing = { finish };
    step();
  });
}

function waitForTap(token) {
  $('next-mark').hidden = false;
  return new Promise(resolve => {
    const done = () => {
      if (waitingTap === done) waitingTap = null;
      $('next-mark').hidden = true;
      resolve();
    };
    waitingTap = done;
    if (FAST) setTimeout(done, 60);
  }).then(() => check(token));
}

function onTap() {
  if (isPopupOpen()) return;
  if (typing) typing.finish();
  else if (waitingTap) waitingTap();
}

function waitForButton(label, token, disabled) {
  return new Promise(resolve => {
    const btn = make('button', 'btn next-btn ' + (disabled ? 'secondary' : 'primary'), label);
    btn.disabled = !!disabled;
    btn.onclick = () => { btn.remove(); resolve(); };
    $('choices').append(btn);
    if (FAST) setTimeout(() => { if (btn.isConnected && !btn.disabled) btn.click(); }, 80);
  }).then(() => check(token));
}

// 멘트 한 줄 보여주기
async function say(line, token) {
  const stage = resolveStage(line);
  if (stage && setStage(stage)) await pause(600, token);
  if (line.days) await playDays(line.days, token);
  if (line.card === 'treaty') openTreaty();

  showSpeaker(line.who);
  $('applied').hidden = true;
  $('line').hidden = false;
  $('line').classList.toggle('small', line.small === true);
  const text = fill(line.small ? `(${line.text})` : (line.text || ''));
  await typeText($('line'), text, token);
  check(token);

  if (line.note) {                              // 무작위 선정 안내 같은 작은 글씨
    $('line-note').textContent = fill(line.note);
    $('line-note').hidden = false;
  }

  // 기억해 둘 표시 (예: domesticFail — A국이 협약을 떠났다. E8 판정에 쓰인다)
  if (line.flag) game[line.flag] = true;

  if (line.change) {
    changeVars(line.change);
    const words = changeText(line.change);
    if (words) {
      $('applied').innerHTML = '';
      const who = line.cause === 'choice' ? '나의 선택으로 ' : '이 사건으로 ';
      $('applied').append(make('span', '', who), coloredChange(line.change), make('span', '', '이 적용되었습니다.'));
      $('applied').hidden = false;
    }
    await pause(900, token);
  }

  if (line.button) await waitForButton(line.button, token);
  else await waitForTap(token);

  if (line.fold) await foldTreaty(token);
}

// "평화 −5, 협력 +15" 를 오르면 초록 내리면 빨강으로
function coloredChange(change) {
  const span = make('span');
  let first = true, hidden = false;
  for (const key of Object.keys(change)) {
    if (!VARS[key]) continue;
    if (isHidden(key)) { hidden = true; continue; }
    const n = change[key];
    if (!first) span.append(', ');
    span.append(make('b', n > 0 ? 'up' : 'down', `${VARS[key].name} ${n > 0 ? '+' : '−'}${Math.abs(n)}`));
    first = false;
  }
  if (hidden) { if (!first) span.append(', '); span.append(make('b', 'locked', '🔒 ??? 변동')); }
  return span;
}

// 질문과 선택 버튼
function ask(scene, token) {
  $('line').hidden = true;
  $('line-note').hidden = true;
  $('applied').hidden = true;
  $('next-mark').hidden = true;
  showSpeaker(scene.who);
  $('sdg-tag').hidden = !scene.tag;
  $('sdg-tag').textContent = scene.tag || '';
  $('question').textContent = fill(scene.question);
  $('question').hidden = false;
  const list = $('choices');
  list.replaceChildren();
  list.classList.remove('locked');
  $('dialog').scrollTop = 0;

  return new Promise(resolve => {
    for (const choice of scene.choices) {
      const btn = make('button', 'choice');
      const words = make('span', 'choice-words');
      words.append(make('span', 'choice-label', choice.label), make('span', 'choice-desc', choice.desc));
      const bar = make('span', 'choice-bar');       // 나중에 '다른 사람들은?' 막대가 채워질 자리
      btn.append(bar, make('span', 'choice-icon', choice.icon), words);
      btn.onclick = () => {
        if (list.classList.contains('locked')) return;
        list.classList.add('locked');
        btn.classList.add('picked');
        resolve({ choice, btn });
      };
      list.append(btn);
    }
  }).then(r => { check(token); return r; });
}

/*
   P2 다른 사람들은? — 고른 직후 그 자리에서 보여준다.
   인터넷이 안 되거나 10명 미만이면 건너뛴다.
*/
async function showShare(scene, picked, token) {
  const info = sharePercent(scene.key, picked.value);
  if (!info) return;
  const buttons = Array.from($('choices').querySelectorAll('.choice'));
  if (info.few) {
    $('applied').textContent = `아직 데이터를 모으는 중이에요 (현재 ${info.total}명)`;
    $('applied').hidden = false;
  } else {
    scene.choices.forEach((c, i) => {
      const n = info.counts[c.value] || 0;
      const pct = Math.round(n / info.total * 100);
      const btn = buttons[i];
      if (!btn) return;
      btn.querySelector('.choice-bar').style.width = pct + '%';
      const tag = make('span', 'choice-pct', pct + '%');
      btn.append(tag);
    });
    $('applied').textContent = `전체 플레이어의 ${info.percent}%가 당신과 같은 선택을 했어요`;
    $('applied').hidden = false;
  }
  await pause(1500, token);
}


/* ---------- 7. 화면 하나 진행하기 ---------- */

function newGame() {
  return {
    vars: { ...START },
    choices: {},
    path: [],
    domesticFail: false,
    trustRevealed: false,
    trustBase: START.trust,
    treatyNotes: [],
    lastChange: null,
    seen: [],              // 이번 판에서 열어 본 분쟁 카드
    exploreNeed: 0,
    named: {},             // 무작위로 뽑힌 나라 이름 { '독립국': '몽골' }
    ids: {},               // 그 나라 코드   { '독립국': 'MNG' }
    calmed: [],            // 세계정부가 멈춘 분쟁
    arcs: [],              // 협약 연결선
    cut: new Set(),        // 협약을 떠난 나라

    // 대본에서 쓰는 도움 함수들
    pick(name, land) { if (land) { this.named[name] = land.ko; this.ids[name] = land.id; } },
    pickList(name, lands) { lands.forEach((l, i) => this.pick(name + i, l)); },
    idList(name, from = 0, to = 99) {
      const out = [];
      for (let i = from; i < to; i++) { const id = this.ids[name + i]; if (id) out.push(id); }
      return out;
    },
    cutArcs(id, followers = 0) {
      if (id) this.cut.add(id);
      for (let i = 0; i < followers; i++) {
        const f = this.ids['참여국' + (i + 2)];
        if (f) this.cut.add(f);
      }
      return this.liveArcs();
    },
    liveArcs() {
      return this.arcs.map(a => (this.cut.has(a[0]) || this.cut.has(a[1])) ? [a[0], a[1], 'cut'] : a);
    },
  };
}

function startGame() {
  game = newGame();
  runId += 1;
  typing = null; waitingTap = null; stageView = '';
  clearDialog();
  drawGauges();
  showLastChange();
  $('event-band').hidden = true;
  $('treaty').hidden = true;
  $('treaty-chip').hidden = true;
  $('explore').hidden = true;
  if (stageGlobe) {
    resetLook(stageGlobe);                    // 지난 판의 건물·회색·이름표를 모두 지운다
    stageGlobe.lon = 20; stageGlobe.lat = 18; stageGlobe.zoom = 1; stageGlobe.touched = false;
  }
  $('meeting').hidden = true;
  $('stage').classList.remove('meeting-on');
  showScreen('game');
  if (FAST) toast('⚡ 빠른 테스트 모드');
  play('W0', runId);
}

async function play(firstId, token) {
  let id = firstId;
  try {
    while (id) id = await runScene(id, token);
  } catch (err) {
    if (err !== STOP) console.error(err);
  }
}

async function runScene(id, token) {
  if (id === 'JUDGE') return judgeEnding(game);
  if (ENDINGS[id]) { await showEnding(id); return null; }

  const scene = SCENES[id];
  if (!scene) { console.error('없는 화면 이름:', id); return null; }

  if (scene.onEnter) scene.onEnter(game);
  clearDialog();
  $('event-band').hidden = scene.event !== true;

  // ① 연출이 먼저
  const stage = resolveStage(scene);
  if (stage && setStage(stage)) await pause(700, token);
  if (scene.event) {
    replayClass($('game'), 'shake');
    await pause(400, token);
  }

  // ② 분쟁 지역 둘러보기 (W0)
  // 지도 파일을 못 읽었으면 점을 누를 수 없으므로 이 단계를 건너뛴다 (게임이 멈추지 않게)
  if (scene.explore) {
    const skip = store.get('exploredOnce', false) === true || !WORLD.ready;
    game.exploreNeed = skip ? 0 : scene.explore;
    updateExplore();
  }

  // ③ 멘트
  for (const line of scene.lines || []) await say(line, token);

  // ④ 분쟁 2곳을 볼 때까지 기다리기
  if (scene.explore) {
    if (game.exploreNeed) {
      $('line-note').textContent = `분쟁 지역을 ${scene.explore}곳 확인해야 다음으로 넘어갈 수 있어요.`;
      $('line-note').hidden = false;
      updateExplore();
      await waitForButton('다음 ▶', token, game.seen.length < game.exploreNeed);
      store.set('exploredOnce', true);
    } else {
      await waitForButton('다음 ▶', token, false);
    }
    $('explore').hidden = true;
    game.exploreNeed = 0;
  }

  // ⑤ 새 변수 공개 (C5)
  if (scene.reveal) {
    clearDialog();
    await revealTrust(scene.reveal, token);
  }

  // ⑥ 판정 이벤트 (C6, C7)
  if (scene.results) {
    const result = scene.results.find(r => r.when(game));
    if (!result) { console.error(id + ': 맞는 결과가 없어요'); return scene.next; }
    if (scene.check && !result.noBlink) await blinkGauge(scene.check, token);
    for (const line of result.lines) await say(line, token);
  }

  // ⑦ 선택지
  if (scene.choices) {
    const { choice } = await ask(scene, token);
    await pause(350, token);
    await showShare(scene, choice, token);
    record(id, scene, choice);
    clearDialog();
    const cstage = resolveStage(choice);
    if (cstage) setStage(cstage);
    if (choice.change) {
      changeVars(choice.change);
      const words = changeText(choice.change);
      if (words) {
        $('applied').innerHTML = '';
        $('applied').append(make('span', '', '나의 선택으로 '), coloredChange(choice.change),
                            make('span', '', '이 적용되었습니다.'));
        $('applied').hidden = false;
      }
      await pause(1200, token);
    }
    for (const line of choice.after || []) await say(line, token);
    return choice.next || scene.next;
  }

  return scene.next;
}

function record(id, scene, choice) {
  if (scene.key) game.choices[scene.key] = choice.value;
  const c = choice.change || {};
  const warn = id.startsWith('C') && ((c.legit || 0) < 0 || (c.trust || 0) < 0);
  game.path.push({ text: choice.path, warn });
  if (scene.treaty) {
    game.treatyNotes.push(choice.path);
    replayClass($('treaty-chip'), 'pulse');
  }
}

async function confirmHome() {
  const answer = await askPopup({
    title: '처음 화면으로 갈까요?',
    body: ['이번 판의 진행 상황은 저장되지 않아요.'],
    buttons: [
      { text: '계속하기', kind: 'secondary', value: 'stay' },
      { text: '처음으로', kind: 'primary', value: 'home' },
    ],
  });
  if (answer === 'home') goHome();
}

function goHome() {
  runId += 1;
  typing = null; waitingTap = null;
  closePopup();
  renderHome();
}


/* ---------- 8. 엔딩 화면 ---------- */

function loadEndings() {
  const saved = store.get('endings', {});
  return (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
}
function countEndings(saved) { return ENDING_IDS.filter(id => saved[id]).length; }

function saveEnding(id) {
  const saved = loadEndings();
  const isNew = !saved[id];
  if (isNew) saved[id] = today();
  store.set('endings', saved);
  store.set('playedOnce', true);
  const count = countEndings(saved);
  return { isNew, count, allJustNow: isNew && count === ENDING_IDS.length };
}

// 엔딩의 지구 모습 (함수면 지금 판의 값을 넣어서 부른다)
function endingLook(e, forGame) {
  const look = typeof e.globe === 'function' ? e.globe(forGame || dummyGame()) : (e.globe || {});
  return look || {};
}

// 도감처럼 '지금 판'이 없을 때 쓰는 빈 판
function dummyGame() {
  return {
    ids: {}, idList: () => [], liveArcs: () => [], cutArcs: () => [], calmed: [],
    named: {}, vars: { ...START },
  };
}

const endingGlobes = [];
function clearEndingGlobes() {
  while (endingGlobes.length) destroyGlobe(endingGlobes.pop());
}

async function showEnding(id) {
  const e = ENDINGS[id];
  const saved = saveEnding(id);
  clearEndingGlobes();
  const page = $('ending-page');
  page.replaceChildren();

  let order = 0;
  const add = (node) => {
    node.classList.add('appear');
    node.style.animationDelay = (FAST ? 0 : order * 0.32) + 's';
    order += 1;
    page.append(node);
  };

  // ① 제목
  const head = make('header', 'e-head');
  head.append(make('p', 'e-type', ENDING_TYPES[e.type]),
              make('p', 'e-no', 'ENDING ' + id.slice(1)),
              make('h1', 'e-title', `${e.icon} ${e.title}`));
  if (saved.isNew) head.append(make('span', 'new-badge', '✨ NEW'));
  add(head);

  // ② 처음 지구와 마지막 지구를 나란히
  const pair = make('div', 'e-pair');
  pair.append(globeCard('처음 지구', {}, '2026년 11월'),
              globeCard('마지막 지구', endingLook(e, game), e.title));
  add(pair);

  // ③ 숫자 요약
  add(summaryBox());

  // ④ 엔딩 문구
  const textBox = make('section', 'e-box');
  textBox.append(make('p', 'e-text', fill(e.text)));
  if (e.extraHint) textBox.append(make('p', 'e-hint', e.extraHint));
  add(textBox);

  // ⑤ 이론 · 현실 · 할 일
  add(infoBox(e.theoryLabel || '📖 이론', e.theory));
  add(infoBox('🌍 현실에서는', e.reality, e.source));
  add(infoBox('✊ 우리가 할 일', e.todo));

  // ⑥ 내가 걸어온 길
  add(pathBox());

  // ⑦ 기록 안내 (통계가 오면 '이 엔딩을 본 사람' 도 붙는다)
  const noteBox = make('p', 'e-record', '기록을 확인하는 중이에요…');
  add(noteBox);

  // ⑧ 모든 엔딩을 처음 다 모은 순간
  if (saved.allJustNow) {
    const banner = make('div', 'all-banner');
    banner.append(make('p', '', '💫 모든 엔딩을 수집했습니다! 스페셜 엔딩이 해금되었어요'));
    const go = make('button', 'btn primary', '💫 보러 가기');
    go.onclick = () => showSpecial();
    banner.append(go);
    add(banner);
  }

  // ⑨ 버튼
  const buttons = make('div', 'e-buttons');
  const again = make('button', 'btn primary again', '🔄 다시 하기');
  again.onclick = startGame;
  const book = make('button', 'btn secondary', '📖 엔딩 도감');
  book.onclick = () => showCollection(id);
  const notes = make('button', 'btn secondary', '📓 연구 노트');
  notes.onclick = openNotes;
  const shot = make('button', 'btn ghost save', '📸 내 지구 저장하기');
  shot.onclick = () => saveMyGlobe(e, id);
  buttons.append(again, book, notes, shot);
  add(buttons);

  showScreen('ending');

  // ⑩ 기록 보내기 (첫 판만) — 화면은 이미 보이므로 기다려도 답답하지 않다
  const res = await recordPlay(game, id);
  const bits = [];
  if (res.first && res.sent) bits.push('✓ 연구 노트에 기록되었어요');
  else if (res.first) bits.push('인터넷에 연결되면 기록을 보낼게요');
  else bits.push('이번 판은 기록되지 않아요 (첫 플레이만 기록)');
  if (res.rank) bits.push(`당신은 ${e.title}에 도달한 ${res.rank}번째 지구인입니다`);
  const stats = await loadStats();
  if (stats && stats.total >= MIN_STATS && stats.ending) {
    const n = stats.ending[id] || 0;
    bits.push(`이 엔딩을 본 사람: 전체 첫 플레이의 ${Math.round(n / stats.total * 100)}%`);
  }
  noteBox.textContent = bits.join(' · ');
}

// 지구 한 칸 (제목 + 지구 + 설명)
function globeCard(label, look, caption) {
  const card = make('div', 'e-globe-card');
  card.append(make('p', 'e-globe-label', label));
  const canvas = make('canvas', 'e-globe');
  card.append(canvas);
  card.append(make('p', 'e-globe-cap', caption || ''));
  requestAnimationFrame(() => {
    const g = makeGlobe(canvas, { spin: 3, lon: 20, lat: 18 });
    setLook(g, look, false);
    endingGlobes.push(g);
  });
  return card;
}

function summaryBox() {
  const box = make('section', 'e-summary');
  for (const key of Object.keys(VARS)) {
    if (isHidden(key)) continue;
    const v = VARS[key], from = START[key], to = game.vars[key];
    const nums = make('span', 'e-nums', `${from} → `);
    nums.append(make('b', to > from ? 'up' : to < from ? 'down' : '', String(to)));
    const row = make('div', 'e-row');
    row.append(make('span', '', `${v.icon} ${v.name}`), nums);
    box.append(row);
  }
  if (!game.trustRevealed) box.append(make('p', 'e-locked', '🔒 이번 판에서 발견하지 못한 변수가 있어요'));
  return box;
}

function infoBox(title, text, source) {
  const box = make('section', 'e-box');
  box.append(make('h3', 'e-label', title));
  if (Array.isArray(text)) {
    const list = make('ul', 'e-list');
    for (const t of text) list.append(make('li', '', fill(t)));
    box.append(list);
  } else {
    box.append(make('p', 'e-info', fill(text)));
  }
  if (source) box.append(make('p', 'e-source', '출처: ' + source));
  return box;
}

function pathBox() {
  const box = make('section', 'e-box');
  box.append(make('h3', 'e-label', '👣 내가 걸어온 길'));
  const list = make('ol', 'e-path');
  for (const step of game.path) {
    list.append(make('li', step.warn ? 'warn' : '', step.text + (step.warn ? ' ⚠️' : '')));
  }
  box.append(list);
  return box;
}

/* 📸 내 지구 저장하기 — 엔딩 제목 + 마지막 지구 + 수치를 한 장으로 */
function saveMyGlobe(e, id) {
  const source = document.querySelectorAll('.e-globe')[1];
  if (!source) return;
  const W = 720, H = 1100;
  const c = make('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  x.fillStyle = '#B1C9EF'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1B2A4A';
  x.textAlign = 'center';
  x.font = '900 54px "Noto Sans KR", sans-serif';
  x.fillText(TITLE.en, W / 2, 96);
  x.font = '500 22px "Noto Sans KR", sans-serif';
  x.fillText(TITLE.sub, W / 2, 132);

  const size = 460;
  x.drawImage(source, (W - size) / 2, 180, size, size);

  x.font = '800 38px "Noto Sans KR", sans-serif';
  x.fillText(`${e.icon} ${e.title}`, W / 2, 712);
  x.font = '600 20px "Noto Sans KR", sans-serif';
  x.fillText(`ENDING ${id.slice(1)} · ${ENDING_TYPES[e.type]}`, W / 2, 750);

  x.font = '600 24px "Noto Sans KR", sans-serif';
  let y = 820;
  for (const key of Object.keys(VARS)) {
    if (isHidden(key)) continue;
    x.fillText(`${VARS[key].icon} ${VARS[key].name}  ${START[key]} → ${game.vars[key]}`, W / 2, y);
    y += 42;
  }
  x.font = '400 18px "Noto Sans KR", sans-serif';
  x.fillStyle = 'rgba(27,42,74,0.7)';
  x.fillText('UNESCO 동아리 · ' + TITLE.maker, W / 2, H - 40);

  const url = c.toDataURL('image/png');
  const img = make('img', 'save-img');
  img.src = url;
  img.alt = '내 지구';
  const link = make('a', 'btn primary', '내려받기');
  link.href = url;
  link.download = `ORVIA_${id}.png`;
  const row = make('div', 'popup-buttons');
  row.append(link);
  openPopup({
    title: '📸 내 지구',
    body: [img, make('p', 'popup-text small', '폰에서는 그림을 길게 눌러 저장할 수 있어요.'), row],
    onClose: closePopup,
  });
}


/* ---------- 9. 엔딩 도감 ---------- */

const miniGlobes = [];
function clearMini() { while (miniGlobes.length) destroyGlobe(miniGlobes.pop()); }

const noteGlobes = [];
function clearNote() { while (noteGlobes.length) destroyGlobe(noteGlobes.pop()); }

function showCollection(highlightId) {
  const saved = loadEndings();
  const n = countEndings(saved);
  clearMini();
  const page = $('collection-page');
  page.replaceChildren();
  page.append(make('h1', 'col-title', `수집한 엔딩 ${n} / 9`),
              make('p', 'col-banner', '💫 스페셜 엔딩은 모든 엔딩을 수집한 후에 해금됩니다.'));

  const grid = make('div', 'col-grid');
  for (const id of ENDING_IDS) {
    const e = ENDINGS[id];
    const card = make('button', 'col-card');
    if (saved[id]) {
      const canvas = make('canvas', 'mini');
      card.append(canvas, make('span', 'col-no', `${e.icon} ${id}`), make('span', 'col-name', e.title));
      requestAnimationFrame(() => {
        const g = makeGlobe(canvas, { spin: 0, still: true, interactive: false, lon: 20, lat: 18 });
        setLook(g, endingLook(e), false);
        miniGlobes.push(g);
      });
      card.onclick = () => {
        const body = [make('p', 'popup-text', e.text.replace(/\{[^}]+\}/g, '그 나라')),
                      make('p', 'popup-date', '처음 본 날: ' + saved[id])];
        infoPopup(`${e.icon} ENDING ${id.slice(1)} · ${e.title}`, body);
      };
    } else {
      card.classList.add('missing');
      card.append(make('span', 'col-q', '?'), make('span', 'col-name', '???'));
      card.onclick = () => infoPopup('💡 힌트', [e.lockedHint]);
    }
    if (id === highlightId) card.classList.add('flash');
    grid.append(card);
  }
  page.append(grid);

  const sp = make('button', 'sp-card');
  if (n === ENDING_IDS.length) {
    sp.classList.add('open');
    sp.textContent = '💫 스페셜 엔딩 보기';
    sp.onclick = () => showSpecial();
  } else {
    sp.append(make('span', 'sp-main', '💫 🔒 ???'),
              make('span', 'sp-sub', `모든 엔딩을 수집하면 열려요 (${n}/9)`));
    sp.onclick = () => toast(`모든 엔딩을 수집하면 열려요 (${n}/9)`);
  }
  page.append(sp);

  const back = make('button', 'btn secondary back-btn', '← 처음 화면');
  back.onclick = renderHome;
  page.append(back);
  showScreen('collection');
}


/* ---------- 10. 스페셜 엔딩 ---------- */

let spGlobes = [];
function clearSp() { while (spGlobes.length) destroyGlobe(spGlobes.pop()); }

function showSpecial() {
  clearSp();
  let step = 0;
  const page = $('special-page');
  showScreen('special');
  draw();

  function draw() {
    page.replaceChildren();
    const s = SPECIAL.screens[step];
    const box = make('div', 'sp-screen');

    if (s.kind === 'title') {
      box.append(make('p', 'sp-eyebrow', 'SPECIAL ENDING'),
                 make('h1', 'sp-title', SPECIAL.title),
                 make('p', 'sp-title-en', SPECIAL.titleEn));
      const grid = make('div', 'sp-grid');
      ENDING_IDS.forEach((id, i) => {
        const canvas = make('canvas', 'sp-mini');
        canvas.style.animationDelay = (i * 0.22) + 's';
        grid.append(canvas);
        requestAnimationFrame(() => {
          const g = makeGlobe(canvas, { spin: 0, still: true, interactive: false, lon: 20, lat: 18 });
          setLook(g, endingLook(ENDINGS[id]), false);
          spGlobes.push(g);
        });
      });
      box.append(grid);

    } else if (s.kind === 'merge') {
      const canvas = make('canvas', 'sp-big');
      box.append(canvas);
      requestAnimationFrame(() => {
        const g = makeGlobe(canvas, { spin: 5, lon: 20, lat: 18 });
        const ids = randomLands(8).map(l => l.id);
        const arcs = ids.map((id, i) => [id, ids[(i + 1) % ids.length]]);
        setLook(g, { arcs, tint: 'blue' }, false);
        spGlobes.push(g);
      });
      box.append(make('h2', 'sp-big-line', s.text), make('p', 'sp-sub-line', s.sub));

    } else if (s.kind === 'answer') {
      box.append(answerPanel());

    } else {
      box.append(make('p', s.big ? 'sp-key' : 'sp-line', s.text));
    }

    page.append(box);

    // 건너뛰기 버튼은 두지 않는다. 읽으라고 만든 화면이기 때문이다.
    if (s.kind !== 'answer') {
      const next = make('button', 'btn primary sp-next', step === SPECIAL.screens.length - 2 ? '마지막으로 ▶' : '다음 ▶');
      next.onclick = () => { step += 1; clearSp(); draw(); page.scrollTop = 0; };
      page.append(next);
    }
  }
}

/* 10번째 화면 — 열린 질문 + 답변 + 상품 응모 */
function answerPanel() {
  const box = make('div', 'answer-panel');
  box.append(make('h2', 'sp-question', SPECIAL.question));
  if (SPECIAL.questionNote) box.append(make('p', 'sp-question-note', SPECIAL.questionNote));

  const area = make('textarea', 'answer-box');
  area.id = 'answer-text';
  area.maxLength = 300;
  area.placeholder = SPECIAL.answerHint;
  area.rows = 5;
  box.append(area);
  const count = make('p', 'answer-count', '0 / 300');
  area.oninput = () => { count.textContent = `${area.value.length} / 300`; };
  box.append(count);
  if (SPECIAL.answerShareNote) box.append(make('p', 'answer-share-note', SPECIAL.answerShareNote));

  // 상품 응모 (선택)
  const entryWrap = make('div', 'entry-wrap');
  const toggle = make('label', 'entry-toggle');
  const check = make('input');
  check.type = 'checkbox'; check.id = 'entry-on';
  toggle.append(check, make('span', '', SPECIAL.entryLabel));
  entryWrap.append(toggle);

  const form = make('div', 'entry-form');
  form.hidden = true;
  for (const f of SPECIAL.entryFields) {
    const row = make('label', 'entry-row');
    row.append(make('span', 'entry-label', f.label));
    const input = make('input');
    input.id = 'entry-' + f.key;
    input.maxLength = f.max;
    input.placeholder = f.hint;
    if (f.digits) { input.inputMode = 'numeric'; }
    row.append(input);
    form.append(row);
  }
  const consent = make('div', 'consent-box');
  consent.append(make('h3', 'consent-title', SPECIAL.entryConsent.title));
  const table = make('dl', 'consent-rows');
  for (const [k, v] of SPECIAL.entryConsent.rows) { table.append(make('dt', '', k), make('dd', '', v)); }
  consent.append(table);
  const agree = make('label', 'entry-toggle');
  const agreeBox = make('input');
  agreeBox.type = 'checkbox'; agreeBox.id = 'entry-agree';
  agree.append(agreeBox, make('span', '', SPECIAL.entryConsent.agree));
  consent.append(agree, make('p', 'consent-note', SPECIAL.entryConsent.note));
  form.append(consent);
  entryWrap.append(form);

  check.onchange = () => { form.hidden = !check.checked; };
  box.append(entryWrap);

  const send = make('button', 'btn primary', '답변 보내기');
  const result = make('p', 'answer-result');
  result.hidden = true;

  send.onclick = async () => {
    const text = area.value.trim();
    const wantEntry = check.checked;
    if (!text) { toast('답변을 먼저 써 주세요'); return; }
    let entry = null;
    if (wantEntry) {
      if (!agreeBox.checked) { toast('개인정보 수집에 동의해야 응모할 수 있어요'); return; }
      entry = {};
      for (const f of SPECIAL.entryFields) entry[f.key] = $('entry-' + f.key).value.trim();
      if (!entry.name || !entry.contact) { toast('이름과 연락처를 써 주세요'); return; }
      if (store.get('entrySent', false) === true) { toast('이 기기에서는 이미 응모했어요'); return; }
    }
    send.disabled = true;
    send.textContent = '보내는 중…';
    try {
      await sendAnswer(text, entry);
      result.textContent = wantEntry ? '✓ 답변과 응모가 접수되었어요. 고마워요!' : '✓ 답변이 접수되었어요. 고마워요!';
      result.hidden = false;
      send.textContent = '보냈어요';
      area.disabled = true;
      check.disabled = true;
      form.hidden = true;
    } catch (e) {
      send.disabled = false;
      send.textContent = '다시 보내기';
      result.textContent = '보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
      result.hidden = false;
    }
  };
  box.append(send, result);

  // 누르면 뒤집히면서 비밀번호(= 이 엔딩의 제목)가 나오는 카드
  const flipWrap = make('div', 'pw-wrap');
  const flipCard = make('button', 'pw-card');
  const front = make('span', 'pw-face pw-front', SPECIAL.passwordNote);
  const back = make('span', 'pw-face pw-back');
  back.append(make('span', 'pw-back-label', SPECIAL.passwordReveal),
              make('b', 'pw-back-text', SPECIAL.title),
              make('span', 'pw-back-en', SPECIAL.titleEn));
  flipCard.append(front, back);
  flipCard.setAttribute('aria-label', '눌러서 비밀번호 확인');
  flipCard.onclick = () => flipCard.classList.toggle('on');
  flipWrap.append(flipCard);
  box.append(flipWrap);
  const row = make('div', 'sp-end-buttons');
  const open = make('button', 'btn secondary', '📓 연구 노트 열기');
  open.onclick = openNotes;
  const home = make('button', 'btn secondary', '처음으로');
  home.onclick = renderHome;
  row.append(open, home);
  box.append(row);
  return box;
}


/* ---------- 11. 연구 노트 ---------- */

function normalize(s) { return String(s || '').replace(/\s/g, '').toLowerCase(); }

function openNotes() {
  if (store.get('unlocked', false) === true) return showNotes();

  const input = make('input', 'pw-input');
  input.placeholder = '비밀번호';
  const warn = make('p', 'pw-warn');
  warn.hidden = true;
  const tryIt = () => {
    const ok = SPECIAL.password.some(p => normalize(p) === normalize(input.value));
    if (ok) { store.set('unlocked', true); closePopup(); showNotes(); return; }
    warn.textContent = '비밀번호가 달라요. 힌트: 💫 스페셜 엔딩의 제목';
    warn.hidden = false;
    replayClass(input, 'shake');
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') tryIt(); };
  openPopup({
    title: '🔒 연구 노트는 잠겨 있어요',
    body: ['비밀번호는 모든 엔딩을 모은 사람만 알 수 있어요.', input, warn],
    buttons: [
      { text: '닫기', kind: 'secondary', onClick: closePopup },
      { text: '확인', kind: 'primary', onClick: tryIt },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

async function showNotes() {
  clearNote();
  const page = $('notes-page');
  page.replaceChildren();
  showScreen('notes');

  const head = make('header', 'n-head');
  head.append(make('h1', 'n-title', '📓 연구 노트'));
  const sub = make('p', 'n-sub', '불러오는 중이에요…');
  head.append(sub);
  const refresh = make('button', 'btn ghost n-refresh', '↻ 새로고침');
  refresh.onclick = () => { statsCache = null; showNotes(); };
  head.append(refresh);
  page.append(head);

  const body = make('div', 'n-body');
  page.append(body);

  const back = make('button', 'btn secondary back-btn', '← 처음 화면');
  back.onclick = renderHome;
  page.append(back);

  const stats = await loadStats(true);
  if (!stats) {
    sub.textContent = '';
    body.append(make('p', 'n-empty', sheetReady()
      ? '인터넷에 연결되면 통계를 볼 수 있어요.'
      : '아직 공용 보관함이 연결되지 않았어요. (구글 시트를 연결하면 모두의 통계가 보입니다)'));
    body.append(noteCard('📝 제작자의 연구 노트', RESEARCH_NOTE));
    body.append(noteCard('연구의 한계', RESEARCH_LIMITS, true));
    return;
  }

  sub.textContent = `지금까지 ${stats.total}명의 첫 플레이 · 마지막 업데이트 ${stats.updated}`;

  if (PEEK) body.append(make('p', 'n-peek', '👀 미리보기 모드 — 10명이 모이기 전에도 통계를 보여주고 있어요. 전교생에게 보낼 링크에는 ?peek 를 빼세요.'));

  if (stats.total < MIN_STATS) {
    body.append(make('p', 'n-empty', `아직 데이터를 모으는 중이에요 (현재 ${stats.total}명). 10명이 모이면 공개됩니다.`));
  } else {
    // 👣 나와 같은 길
    const myPath = store.get('myPath', null);
    if (myPath && stats.path) {
      const same = stats.path[myPath] || 0;
      body.append(statCard('👣 나와 같은 길',
        `당신과 똑같은 길을 걸은 사람: 전체의 ${Math.round(same / stats.total * 100)}% (${same}명)`));
    }
    // 🚩 n번째 개척자
    const rank = store.get('myRank', null);
    if (rank && ENDINGS[rank.ending]) {
      body.append(statCard('🚩 개척자',
        `당신은 ${ENDINGS[rank.ending].title}에 도달한 ${rank.rank}번째 지구인입니다`));
    }
    body.append(hypothesisCard(stats));      // 🔍 가설 검증
    body.append(collectiveCard(stats));      // 🌍 전교생이 함께 만든 지구
    body.append(legitPeaceCard(stats));      // ⚖️ 정당성과 평화의 관계
    body.append(missedVarCard(stats));       // 🔒 놓친 변수
    body.append(twistCard(stats));           // 😮 반전 통계

    // 비율 막대들
    body.append(barCard('첫 질문: 세계정부를 세울까?', stats.q1,
      { gov: '🏛️ 세운다', nogov: '🌐 세우지 않는다' }));
    body.append(endingCard(stats));
    if (stats.q2) body.append(barCard('세계정부를 세운 뒤', stats.q2,
      { force: '강대국 주도', consent: '모든 나라의 합의' }));
    if (stats.q3) body.append(barCard('독립 요구에 대한 대응', stats.q3,
      { suppress: '진압한다', negotiate: '협상한다' }));
    if (stats.q2) body.append(barCard('세계정부 없는 길에서', stats.q2,
      { alone: '각자 알아서', partner: '새로운 협력 체제' }));
    body.append(barCard('C1 규칙은 누가 정할까?', stats.c1, { powers: '강대국들이', all: '모든 나라가 함께' }));
    body.append(barCard('C2 누가 참여할까?', stats.c2, { gov: '각국 정부만', multi: '정부·기업·시민사회' }));
    body.append(barCard('C3 약속을 어기면?', stats.c3,
      { ignore: '그냥 넘어감', graduated: '공개 + 단계적 불이익', sanction: '즉시 강력한 제재' }));
    body.append(barCard('C4 어디까지 동의받을까?', stats.c4, { fast: '정부끼리 빠르게', ratify: '국민 동의 + 국회' }));

    body.append(choiceEffectCard(stats));    // 📊 선택이 바꾼 결과
    body.append(conflictRankCard(stats));    // 🗺️ 사람들이 많이 본 분쟁
    body.append(answersCard(stats));         // ✍️ 함께 쓴 답변
  }

  body.append(noteCard('📝 제작자의 연구 노트', RESEARCH_NOTE));
  body.append(noteCard('연구의 한계', RESEARCH_LIMITS, true));
}


/* ---------- 연구 노트에 들어가는 카드들 ---------- */

// 선택지 이름표 (연구 노트에서 코드 대신 사람 말로 보여 주려고)
const CHOICE_LABEL = {
  q1: { gov: '세계정부를 세운다', nogov: '세우지 않는다' },
  q2: { force: '강대국 주도', consent: '모든 나라의 합의', alone: '각자 알아서', partner: '새로운 협력 체제' },
  q3: { suppress: '진압한다', negotiate: '협상한다' },
  c1: { powers: '강대국들이 정한다', all: '모든 나라가 함께' },
  c2: { gov: '각국 정부만', multi: '정부·기업·시민사회' },
  c3: { ignore: '그냥 넘어감', graduated: '공개 + 단계적 불이익', sanction: '즉시 강력한 제재' },
  c4: { fast: '정부끼리 빠르게', ratify: '국민 동의 + 국회' },
};

/* 🔍 ① 가설 검증 — 이 탐구의 처음 질문에 데이터로 답한다 */
function hypothesisCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '🔍 가설 검증'));
  card.append(make('p', 'n-quote', '"강제력을 가진 세계정부가 있다면, 평화가 더 쉽게 오지 않을까?"'));

  const gov = (stats.q1 && stats.q1.gov) || 0;
  const partner = (stats.q2 && stats.q2.partner) || 0;
  const e = stats.ending || {};
  const by = stats.byChoice || {};

  const rows = [];
  if (gov >= Math.min(5, MIN_STATS)) {
    const bad = ((e.E1 || 0) + (e.E2 || 0)) / gov * 100;
    const avg = by.q1 && by.q1.gov ? by.q1.gov.peace : null;
    rows.push(['🏛️ 세계정부를 세운 사람', gov, Math.round(bad), avg]);
  }
  if (partner >= Math.min(5, MIN_STATS)) {
    const good = (e.E9 || 0) / partner * 100;
    const avg = by.q2 && by.q2.partner ? by.q2.partner.peace : null;
    rows.push(['🤝 협력 체제를 택한 사람', partner, null, avg, Math.round(good)]);
  }
  if (!rows.length) {
    card.append(make('p', 'n-text', '아직 비교할 만큼 데이터가 모이지 않았어요.'));
    return card;
  }
  for (const [label, n, bad, avgPeace, good] of rows) {
    const line = make('p', 'n-text');
    line.append(make('b', '', label), ` ${n}명 · `);
    if (bad !== null && bad !== undefined) line.append(`💀 배드엔딩 ${bad}% · `);
    if (good !== null && good !== undefined) line.append(`🌱 지속되는 협력 ${good}% · `);
    if (avgPeace !== null) line.append(`평균 평화 ${avgPeace}`);
    card.append(line);
  }
  return card;
}

/* 🌍 ⑤ 전교생이 함께 만든 지구 — 모두의 마지막 수치를 평균 내어 지구 하나로 */
const COLLECTIVE_LANDS = ['BRA', 'ZAF', 'IDN', 'AUS', 'CAN', 'DEU', 'JPN', 'MEX', 'KEN', 'ARG'];
function collectiveCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '🌍 우리가 함께 만든 지구'));
  if (!stats.avg) {
    card.append(make('p', 'n-text', '아직 수치 기록이 모이지 않았어요.'));
    return card;
  }
  const a = stats.avg;
  card.append(make('p', 'n-text', `지금까지 ${a.n}명이 남긴 마지막 수치의 평균으로 그린 지구예요.`));

  const canvas = make('canvas', 'n-globe');
  card.append(canvas);
  requestAnimationFrame(() => {
    const g = makeGlobe(canvas, { spin: 3, lon: 20, lat: 18 });
    // 평화가 높을수록 분쟁 점이 적고, 협력이 높을수록 연결선이 많고, 색도 달라진다
    const hideN = Math.round(a.peace / 100 * 10);
    const arcN = Math.round(a.coop / 100 * 9);
    const ids = COLLECTIVE_LANDS.filter(id => WORLD.byId[id]);
    const arcs = [];
    for (let i = 0; i < arcN && i < ids.length; i++) arcs.push([ids[i], ids[(i + 1) % ids.length]]);
    setLook(g, {
      hide: CONFLICTS.slice(0, hideN).map(c => c.id),
      arcs,
      tint: a.peace >= 55 ? 'blue' : a.peace >= 35 ? null : 'murky',
    }, false);
    noteGlobes.push(g);
  });

  const box = make('div', 'n-avg');
  for (const key of ['peace', 'coop', 'legit', 'trust']) {
    const row = make('div', 'n-avg-row');
    row.append(make('span', '', `${VARS[key].icon} ${VARS[key].name}`), make('b', '', String(a[key])));
    box.append(row);
  }
  card.append(box);
  card.append(make('p', 'n-small', '국내 신뢰도는 파트너십 회의까지 간 사람만 움직인 값이라, 평균이 50에 가깝게 나올 수 있어요.'));
  return card;
}

/* ⚖️ ② 정당성과 평화의 관계 */
function legitPeaceCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '⚖️ 정당성이 높으면 평화도 높았을까?'));
  const bands = ['0-19', '20-39', '40-59', '60-79', '80-100'];
  const data = stats.legitBand || {};
  const any = bands.some(b => data[b] && data[b].n >= Math.min(3, MIN_STATS));
  if (!any) {
    card.append(make('p', 'n-text', '아직 비교할 만큼 데이터가 모이지 않았어요.'));
    return card;
  }
  for (const b of bands) {
    const d = data[b];
    const row = make('div', 'n-bar-row');
    row.append(make('span', 'n-bar-label', `정당성 ${b}`));
    const track = make('span', 'n-bar');
    const f = make('span', 'n-bar-fill');
    f.style.width = (d ? d.peace : 0) + '%';
    track.append(f);
    row.append(track, make('span', 'n-bar-pct', d ? `평화 ${d.peace}` : '—'));
    card.append(row);
  }
  card.append(make('p', 'n-small', '막대 길이는 그 구간에 머문 사람들의 마지막 평화 수치 평균이에요.'));
  return card;
}

/* 🔒 ③ 놓친 변수 */
function missedVarCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '🔒 끝까지 발견하지 못한 변수'));
  const partner = (stats.q2 && stats.q2.partner) || 0;
  const missed = stats.total - partner;
  const pct = Math.round(missed / stats.total * 100);
  card.append(make('p', 'n-big', `${pct}%는 '국내 신뢰도'라는 변수가 있다는 것조차 모른 채 끝냈습니다 (${missed}명).`));
  card.append(make('p', 'n-text',
    '이 변수는 파트너십 회의까지 간 사람에게만 공개됩니다. 나라 사이의 약속을 각 나라 국민이 지지하는가 — 이 게임에서 가장 중요한 변수인데도 말입니다.'));
  return card;
}

/* 📊 ④ 선택이 바꾼 결과 */
function choiceEffectCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '📊 선택이 바꾼 결과'));
  const by = stats.byChoice || {};
  const titles = { c1: 'C1 규칙', c2: 'C2 참여', c3: 'C3 위반 시', c4: 'C4 확정' };
  let any = false;
  for (const key of ['c1', 'c2', 'c3', 'c4']) {
    if (!by[key]) continue;
    const sub = make('p', 'n-sub-title', titles[key]);
    card.append(sub);
    for (const val of Object.keys(CHOICE_LABEL[key])) {
      const d = by[key][val];
      if (!d || d.n < Math.min(3, MIN_STATS)) continue;
      any = true;
      const row = make('div', 'n-effect-row');
      row.append(make('span', 'n-effect-label', CHOICE_LABEL[key][val]));
      row.append(make('span', 'n-effect-nums',
        `평화 ${d.peace} · 협력 ${d.coop} · 정당성 ${d.legit}  (${d.n}명)`));
      card.append(row);
    }
  }
  if (!any) card.append(make('p', 'n-text', '아직 비교할 만큼 데이터가 모이지 않았어요.'));
  else card.append(make('p', 'n-small', '그 선택을 고른 사람들의 마지막 수치 평균이에요.'));
  return card;
}

/* 🗺️ ⑧ 사람들이 많이 본 분쟁 지역 */
function conflictRankCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '🗺️ 사람들이 많이 열어 본 분쟁 지역'));
  const counts = stats.conflicts || {};
  const rank = CONFLICTS.map(c => ({ c, n: counts[c.id] || 0 }))
    .filter(r => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  if (!rank.length) {
    card.append(make('p', 'n-text', '아직 기록이 모이지 않았어요.'));
    return card;
  }
  const top = rank[0].n;
  for (const r of rank) {
    const row = make('div', 'n-bar-row');
    row.append(make('span', 'n-bar-label', r.c.name));
    const track = make('span', 'n-bar');
    const f = make('span', 'n-bar-fill');
    f.style.width = Math.round(r.n / top * 100) + '%';
    f.style.background = DOT[r.c.color] || '#F28C28';
    track.append(f);
    row.append(track, make('span', 'n-bar-pct', r.n + '명'));
    card.append(row);
  }
  return card;
}

/* ✍️ ⑩ 함께 쓴 답변 (제작자가 고른 것만 익명으로) */
function answersCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '✍️ 우리가 함께 쓴 답'));
  card.append(make('p', 'n-sub-title', SPECIAL.question));
  const list = stats.picked || [];
  if (!list.length) {
    card.append(make('p', 'n-text', '아직 소개할 답변이 없어요. 스페셜 엔딩에서 답을 남겨 주세요.'));
    return card;
  }
  for (const text of list) card.append(make('blockquote', 'n-answer', text));
  card.append(make('p', 'n-small', '제작자가 고른 답변을 이름 없이 싣습니다.'));
  return card;
}

function statCard(title, text) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', title), make('p', 'n-big', text));
  return card;
}

function noteCard(title, lines, small) {
  const card = make('section', 'n-card' + (small ? ' small' : ''));
  card.append(make('h3', 'n-card-title', title));
  for (const line of lines) card.append(make('p', 'n-text', line));
  return card;
}

function barCard(title, counts, labels) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', title));
  const keys = Object.keys(labels);
  const total = keys.reduce((a, k) => a + (counts && counts[k] || 0), 0);
  if (total < MIN_STATS) {
    card.append(make('p', 'n-text', `데이터 부족 (${total}명)`));
    return card;
  }
  for (const k of keys) {
    const n = counts[k] || 0, pct = Math.round(n / total * 100);
    const row = make('div', 'n-bar-row');
    row.append(make('span', 'n-bar-label', labels[k]));
    const track = make('span', 'n-bar');
    const fillBar = make('span', 'n-bar-fill');
    fillBar.style.width = pct + '%';
    track.append(fillBar);
    row.append(track, make('span', 'n-bar-pct', pct + '%'));
    card.append(row);
  }
  return card;
}

function endingCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '엔딩 분포'));
  const byType = { bad: 0, unfinished: 0, hope: 0 };
  for (const id of ENDING_IDS) {
    const n = (stats.ending && stats.ending[id]) || 0;
    byType[ENDINGS[id].type] += n;
    const pct = stats.total ? Math.round(n / stats.total * 100) : 0;
    const row = make('div', 'n-bar-row');
    row.append(make('span', 'n-bar-label', `${ENDINGS[id].icon} ${ENDINGS[id].title}`));
    const track = make('span', 'n-bar');
    const f = make('span', 'n-bar-fill ' + ENDINGS[id].type);
    f.style.width = pct + '%';
    track.append(f);
    row.append(track, make('span', 'n-bar-pct', pct + '%'));
    card.append(row);
  }
  card.append(make('p', 'n-text',
    `💀 ${byType.bad}명 · 🤯 ${byType.unfinished}명 · 🌱 ${byType.hope}명`));
  return card;
}

function twistCard(stats) {
  const card = make('section', 'n-card');
  card.append(make('h3', 'n-card-title', '😮 반전 통계'));
  const e = stats.ending || {};
  const lines = [];

  const gov = (stats.q1 && stats.q1.gov) || 0;
  const badFromGov = (e.E1 || 0) + (e.E2 || 0);
  if (gov >= MIN_STATS) lines.push(`세계정부를 세운 사람의 ${Math.round(badFromGov / gov * 100)}%가 💀 배드엔딩을 만났습니다.`);

  const partner = (stats.q2 && stats.q2.partner) || 0;
  if (partner >= MIN_STATS) lines.push(`파트너십 회의까지 간 사람 중 🌱 E9에 도달한 사람은 ${Math.round((e.E9 || 0) / partner * 100)}%뿐입니다.`);

  if ((e.E8 || 0) > 0) lines.push(`국제 조건을 모두 갖추고도 국민의 동의를 건너뛴 사람(E8)은 ${e.E8}명이었습니다.`);

  if (!lines.length) lines.push('아직 반전 통계를 만들 만큼 데이터가 모이지 않았어요.');
  for (const l of lines) card.append(make('p', 'n-text', l));
  return card;
}


/* ---------- 12. 처음 화면과 시작 ---------- */

function renderHome() {
  clearEndingGlobes(); clearMini(); clearSp(); clearNote();
  const n = countEndings(loadEndings());
  const played = store.get('playedOnce', false) === true;
  const btn = $('btn-collection');
  btn.textContent = `📖 수집한 엔딩 (${n}/9)` + (played ? '' : ' 🔒');
  btn.classList.toggle('locked', !played);
  $('btn-notes').textContent = '📓 연구 노트' + (store.get('unlocked', false) === true ? '' : ' 🔒');
  showScreen('home');
}

function openCollectionFromHome() {
  if (store.get('playedOnce', false) === true) showCollection();
  else toast('한 판을 끝까지 플레이하면 열려요');
}

// H1 안내·동의 창
function openConsent() {
  let agreed = store.get('agreed', false) === true;

  const list = make('ol', 'consent-list');
  for (const item of CONSENT) {
    const li = make('li');
    if (item.bold) li.append(make('b', '', item.bold), ' ');
    li.append(item.text);
    list.append(li);
  }

  const agreeBtn = make('button', 'btn');
  const startBtn = make('button', 'btn primary', '시작하기');
  function refresh() {
    agreeBtn.textContent = agreed ? '✓ 동의함 (다시 누르면 취소)' : '동의합니다';
    agreeBtn.className = 'btn ' + (agreed ? 'agreed' : 'secondary');
    startBtn.disabled = !agreed;
  }
  // 다시 누르면 동의가 취소되고 [시작하기]가 잠긴다
  agreeBtn.onclick = () => { agreed = !agreed; store.set('agreed', agreed); refresh(); };
  startBtn.onclick = () => { if (!agreed) return; closePopup(); startGame(); };
  refresh();

  const row = make('div', 'popup-buttons column');
  row.append(agreeBtn, startBtn);
  openPopup({ title: '플레이 전에 확인해 주세요', body: [list, row], onClose: closePopup, className: 'consent' });
}


/* ---------- 시작! ---------- */

async function init() {
  // 화면 조각 만들기
  $('title-en').textContent = TITLE.en;
  $('title-sub').textContent = TITLE.sub;
  $('tagline').textContent = TITLE.tagline;
  $('maker').textContent = TITLE.maker;
  $('club').textContent = TITLE.club;
  $('home-foot').textContent = TITLE.foot;
  document.title = TITLE.en;

  buildGauges();
  buildMeeting();
  renderHome();

  // 버튼 연결
  $('btn-start').onclick = openConsent;
  $('btn-collection').onclick = openCollectionFromHome;
  $('btn-notes').onclick = openNotes;
  $('btn-home').onclick = confirmHome;
  $('ending-home').onclick = renderHome;
  $('treaty-chip').onclick = () => openPopup({
    body: [treatyCard()], buttons: [{ text: '닫기', kind: 'secondary', onClick: closePopup }],
  });

  // 무대나 멘트 상자를 탭하면 다음으로 (버튼이나 지구를 누른 건 빼고)
  $('dialog').addEventListener('click', (e) => { if (!e.target.closest('button')) onTap(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if ($('game').hidden || e.target.closest('button, input, textarea')) return;
    e.preventDefault();
    onTap();
  });

  // 지도 데이터 읽고 지구 만들기
  try {
    await loadWorld('data/world.geo.json');
  } catch (e) {
    console.error(e);
    toast('지도 파일(data/world.geo.json)을 불러오지 못했어요');
  }

  stageGlobe = makeGlobe($('stage-globe'), { spin: 4, lon: 20, lat: 18 });
  stageGlobe.onTapMarker = openConflictCard;

  // 처음 화면 뒤에서 천천히 도는 큰 지구 + 이어졌다 사라지는 연결선
  homeGlobe = makeGlobe($('home-globe'), { spin: 2.5, lon: 20, lat: 14, alpha: 0.3, interactive: false });
  setLook(homeGlobe, { markers: 0 }, false);
  function weaveArcs() {
    if (!WORLD.ready || !homeGlobe) return;
    const ids = randomLands(6).map(l => l.id);
    const arcs = ids.map((id, i) => [id, ids[(i + 1) % ids.length]]);
    setLook(homeGlobe, { markers: 0, arcs });
  }
  weaveArcs();
  setInterval(weaveArcs, 5200);

  // 지난번에 못 보낸 기록이 있으면 조용히 다시 보내고, 통계를 미리 받아 둔다
  retryPending();
  loadStats();
}

init();
