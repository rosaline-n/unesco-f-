/* =========================================================
   scenes.js — 게임의 '대본'
   ---------------------------------------------------------
   멘트, 선택지, 수치, 지구 연출 지시가 전부 이 파일에 있다.
   문구나 숫자를 고칠 때는 이 파일만 고치면 된다.
     · 화면을 움직이는 코드 → game.js
     · 지구 그리는 코드     → globe.js
     · 엔딩 9개 + 스페셜    → endings.js
     · 분쟁 지역 18곳       → conflicts.js
     · 색과 글자 크기       → style.css

   문구는 백틱(`) 사이에 쓴다. 그래서 ' 와 " 를 마음대로 쓸 수 있다.

   문구 안의 {이름} 은 그 판에서 무작위로 뽑힌 나라 이름으로 바뀐다.
     {독립국:이}  → "독일이" / "프랑스가"  (뒤 글자를 보고 조사를 알아서 고름)
     쓸 수 있는 조사: 이/가 · 은/는 · 을/를 · 와/과 · 으로/로
   ========================================================= */


/* ① 게임 제목 (처음 화면과 브라우저 탭에 나온다) */
const TITLE = {
  en: `ORVIA`,
  sub: `:서로 다른 궤도를 잇는 길`,
  tagline: `세계 위에 누구도 없을 때, 우리는 함께할 수 있을까?`,
  maker: `programmed by 장주연`,
  club: `UNESCO 동아리`,
  foot: `2026.11.1 기준 · 이론 기반 가상 시나리오`,
};


/* ② 시작 수치 */
const START = { peace: 30, coop: 40, legit: 50, trust: 50 };


/* ③ 변수 4개
   tip    : 게이지 칸을 누르면 2초 동안 뜨는 설명
   hidden : true면 C5 전까지 🔒 ??? 로 숨김 */
const VARS = {
  peace: { icon: '🕊️', name: '평화',       tip: `세계에 분쟁이 얼마나 적은가` },
  coop:  { icon: '🤝', name: '협력',       tip: `나라들이 약속을 얼마나 지키는가` },
  legit: { icon: '⚖️', name: '정당성',     tip: `나라들과 사람들이 국제 질서와 규칙에 얼마나 동의하는가` },
  trust: { icon: '🏠', name: '국내 신뢰도', tip: `각 나라 국민이 그 협력을 얼마나 "우리의 약속"으로 지지하는가`,
           hidden: true },
};


/* ④ 말하는 사람 (멘트 상자 왼쪽 위 이름표) */
const SPEAKERS = {
  africa:  { icon: '🌍', name: '아프리카 대표' },
  asia:    { icon: '🌏', name: '아시아 대표' },
  europe:  { icon: '🌍', name: '유럽 대표' },
  america: { icon: '🌎', name: '아메리카 대표' },
  oceania: { icon: '🌏', name: '오세아니아 대표' },
  some:    { icon: '🌏', name: '몇몇 대표들', seats: ['asia', 'europe', 'oceania'] },
  region:  { icon: '📢', name: '{독립국} 대표' },
};


/* ⑤ 무작위로 뽑힌 나라 옆에 늘 붙는 안내 */
const RANDOM_NOTE = `이 나라는 전 세계 모든 나라 중 무작위로 선정되었어요. 플레이할 때마다 바뀌어요.`;


/* ⑥ H1 안내·동의 창 */
const CONSENT = [
  { text: `이 프로그램은 2026년 11월 1일을 기준으로 제작되었습니다. 시간이 지난 뒤에 플레이하면, 그동안 일어난 사건은 반영되지 않았을 수 있습니다.` },
  { text: `이 게임은 제작자의 탐구 가설을 바탕으로, 정치철학과 사회학 이론에 기반해 만든 가상 시나리오입니다. 실제 미래를 정밀하게 예측하지 않는다는 점을 알고 플레이해 주세요.` },
  { text: `실제 분쟁 지역 정보는 공개된 자료를 바탕으로 했으며, 특정 국가나 집단을 지지하거나 비난하려는 목적이 없습니다. 게임 속에서 이름이 나오는 나라는 무작위로 뽑힌 것이며, 플레이할 때마다 바뀝니다.` },
  { bold: `데이터 수집 안내:`,
    text: `기기마다 처음으로 끝까지 플레이한 1회의 선택 기록이 익명으로 수집됩니다. 수집된 기록은 게임 속 '연구 노트' 통계와 UNESCO 동아리 발표 자료에 쓰이며, 이름·연락처 등 개인정보는 수집하지 않습니다. 익명 선택 기록은 연구 노트 통계를 위해 계속 보관됩니다. 스페셜 엔딩의 상품 응모에 참여하는 분에 한해, 따로 동의를 받아 학번, 이름, 연락처(전화번호 또는 인스타그램 아이디)를 수집하며, 상품 지급 외의 용도로는 사용하지 않고 상품 지급 후 1년 동안 보관한 뒤 삭제됩니다.` },
];


/* ⑦ C0 협약 초안 카드 */
const TREATY = {
  title: `📜 지구 파트너십 협약 (초안)`,
  items: [
    `① 여유 있는 나라는 국민총소득(GNI)의 0.7%를 개발도상국 지원에 쓴다 (SDG 17.2)`,
    `② 친환경 기술을 개발도상국과 나눈다 (SDG 17.7)`,
    `③ 약속 이행 상황을 데이터로 공개한다 (SDG 17.18)`,
  ],
};


/* ⑧ 화면들
   ---------------------------------------------------------
   화면 하나 = { } 하나. 쓸 수 있는 칸:

   onEnter(game) : 화면에 들어올 때 한 번 실행 (무작위 나라 뽑기 등)
   stage    : 가운데에 무엇을 보여줄지
       view   : 'globe' 지구 · 'meeting' 회의장
       globe  : 지구 모습 (globe.js의 look. tint / gray / arcs / building / heat ... )
       note   : 지구 위쪽에 뜨는 작은 알림
   event    : true면 이벤트 (주황 띠 + 화면 흔들림)
   lines    : 멘트 목록. 탭할 때마다 한 줄씩
       text   : 멘트
       who    : 말하는 사람 (④의 이름). 없으면 나레이션
       small  : true면 작게 말하기 (회색 + 기울임 + 괄호)
       note   : 멘트 아래 작은 안내 (무작위 선정 안내 등)
       change : 이 멘트가 끝난 뒤 바뀌는 수치  예) { peace: +30, legit: -30 }
       cause  : 수치가 왜 바뀌었는지 — 'choice' 나의 선택으로 · 'event' 이 사건으로
       flag   : 기록해 둘 표시  예) 'domesticFail'
       stage  : 이 멘트 직전에 지구 모습 바꾸기
       days   : 이 멘트 직전에 날짜가 넘어가는 연출 (A7)
       card   : 'treaty'면 협약 카드를 펼침 (C0)
       fold   : true면 이 멘트 뒤에 협약 카드를 구석으로 접음
       button : 탭 대신 이 버튼을 눌러야 넘어감
   question : 질문 (큰 글씨)
   who, tag : 질문하는 사람, SDG 세부목표 태그
   key      : 이 질문의 기록 이름 (연구 노트용: q1, q2, q3, c1~c4)
   treaty   : true면 고른 내용이 협약 카드에 한 줄씩 쌓임
   choices  : 선택 버튼 목록
       icon, label, desc : 버튼 아이콘, 제목, 회색 설명
       value  : 기록에 남는 값
       path   : 엔딩 화면 '👣 내가 걸어온 길'에 보이는 글자
       change : 누른 직후 바뀌는 수치
       after  : 수치가 바뀐 뒤 나오는 반응 멘트
       stage  : 고른 직후 지구 모습 바꾸기
       next   : 다음 화면 (없으면 화면의 next)
   reveal   : 새 변수 공개 (C5)
   check    : 판정에 쓰는 게이지 (1초 깜빡임)
   results  : 판정 결과 목록. 위에서부터 when이 맞는 것 하나만 나옴
   next     : 다음 화면. 'JUDGE'면 엔딩 판정 (⑨)
   --------------------------------------------------------- */
const SCENES = {

  /* ===== 오늘의 지구 (W0 ~ W2) ===== */

  W0: {
    stage: { view: 'globe', globe: {} },
    explore: 2,            // 분쟁 지역을 2곳 확인해야 다음으로 넘어갈 수 있다
    lines: [
      { text: `지구를 손가락으로 돌려보세요. 깜빡이는 곳을 누르면 분쟁 지역 정보를 볼 수 있어요.` },
    ],
    next: 'W1',
  },

  W1: {
    stage: { view: 'globe', globe: {} },
    lines: [
      { text: `2026년 11월, 지구.` },
      { text: `세계 곳곳에서 전쟁과 내전이 이어지고 있습니다. 휴전은 여러 번 맺어졌지만, 서로를 믿지 못해 오래가지 못했습니다.` },
      { text: `기후 위기는 국경을 가리지 않습니다. 가장 큰 피해는 대응할 힘이 부족한 가난한 나라들이 입고 있습니다.` },
      { text: `선진국들은 1970년, 국민총소득의 0.7%를 개발도상국 지원에 쓰겠다고 약속했습니다. 하지만 2025년 실제로 낸 돈은 0.26%였습니다.` },
      { text: `나라 안에서는 갈등이 생기면 법과 정부가 조정합니다. 그런데 나라들 위에는, 그 역할을 할 정부가 없습니다.` },
      { text: `만약 세계에도 정부가 있다면, 어떨까요?` },
    ],
    next: 'W2',
  },

  W2: {
    question: `세계정부를 세우시겠습니까?`,
    key: 'q1',
    choices: [
      { icon: '🏛️', label: `세운다`, desc: `모든 나라 위에 하나의 정부를 둔다`,
        value: 'gov', path: `세계정부를 세운다`, next: 'A1' },
      { icon: '🌐', label: `세우지 않는다`, desc: `나라들은 각자의 주권을 지킨다`,
        value: 'nogov', path: `세계정부를 세우지 않는다`, next: 'B1' },
    ],
  },


  /* ===== 세계정부 루트 (A1 ~ A8) ===== */

  A1: {
    stage: { view: 'globe', globe: { building: 0.18 }, note: `🚧 세계정부 건설 예정지` },
    lines: [
      { text: `지구 위에 세계정부를 세울 자리가 마련되었습니다.` },
    ],
    next: 'A2',
  },

  A2: {
    question: `세계정부를 어떻게 세울까요?`,
    key: 'q2',
    choices: [
      { icon: '⚡', label: `강대국이 주도해 빠르게 세운다`, desc: `빠르고 효율적이지만, 모두가 동의한 것은 아닙니다`,
        value: 'force', path: `강대국 주도`, next: 'A3' },
      { icon: '🤝', label: `모든 나라의 합의로 세운다`, desc: `모두가 동의하지만, 시간이 오래 걸립니다`,
        value: 'consent', path: `모든 나라의 합의`, next: 'A7' },
    ],
  },

  A3: {
    // 세계정부가 억누른 분쟁 몇 곳을 그 판마다 다르게 고른다
    onEnter(game) {
      game.calmed = ['sudan', 'myanmar', 'yemen', 'sahel', 'drc', 'tigray']
        .sort(() => Math.random() - 0.5).slice(0, 5);
    },
    stage: { view: 'globe', globe: { building: 1 } },
    lines: [
      { text: `강대국들이 주도해 세계정부가 빠르게 세워졌습니다.` },
      { text: `세계정부의 군대가 분쟁 지역에 들어가 전투를 멈추게 했습니다. 일부 지역은 휴전에 들어갔습니다.`,
        stageFn: (game) => ({ globe: { building: 1, hide: game.calmed } }),
        change: { peace: +30, coop: +20 }, cause: 'choice' },
      { text: `하지만 세계정부의 주요 자리는 강대국들이 차지했습니다.` },
      { text: `몇몇 나라에서 목소리가 나오기 시작합니다. "우리는 이 정부에 동의한 적이 없다."`,
        change: { legit: -30 }, cause: 'choice' },
    ],
    next: 'A4',
  },

  A4: {
    // 독립을 선언하는 나라를 전 세계에서 무작위로 고른다
    onEnter(game) {
      const [one, ...rest] = randomLands(5);
      game.pick('독립국', one);
      game.pickList('동조국', rest);
    },
    event: true,
    stageFn: (game) => ({
      view: 'globe', globe: { building: 1, focus: game.ids['독립국'], glow: [game.ids['독립국']],
                              labels: [{ id: game.ids['독립국'], kind: 'danger' }] },
    }),
    lines: [
      { text: `⚠️ {독립국:이} 세계정부에서 독립하겠다고 선언했습니다.`, note: RANDOM_NOTE },
      { who: 'region', text: `"강대국들이 정한 법을 왜 우리가 따라야 합니까? 우리의 일은 우리가 결정하겠습니다."` },
    ],
    question: `세계정부는 어떻게 대응할까요?`,
    key: 'q3',
    choices: [
      { icon: '🛡️', label: `진압한다`, desc: `세계정부의 질서를 지킨다`,
        value: 'suppress', path: `진압한다`, next: 'A5' },
      { icon: '💬', label: `협상한다`, desc: `대화로 해결한다`,
        value: 'negotiate', path: `협상한다`, next: 'A6' },
    ],
  },

  A5: {
    stageFn: (game) => ({
      view: 'globe',
      globe: { building: 1, hide: game.calmed, focus: game.ids['독립국'],
               gray: [game.ids['독립국']], labels: [{ id: game.ids['독립국'], kind: 'danger' }],
               tint: 'graylight' },
    }),
    lines: [
      { text: `세계정부군이 {독립국:을} 진압했습니다. 그 지역은 다시 조용해졌습니다.`,
        change: { peace: +10, coop: +5, legit: -20 }, cause: 'choice' },
      { text: `그날 이후, 세계정부에 반대하는 목소리는 더 이상 들리지 않습니다.`,
        stageFn: (game) => ({ globe: { building: 1, hide: game.calmed, focus: game.ids['독립국'],
                                       gray: game.idList('동조국', 0, 5).concat(game.ids['독립국']), tint: 'gray' } }) },
      { text: `전쟁은 사라졌습니다. 그런데, 도망칠 곳도 사라졌습니다.` },
    ],
    next: 'E1',
  },

  A6: {
    stageFn: (game) => ({
      view: 'globe',
      globe: { building: 1, focus: game.ids['독립국'], glow: [game.ids['독립국']],
               labels: [{ id: game.ids['독립국'] }] },
    }),
    lines: [
      { text: `세계정부는 {독립국:과} 협상을 시작했습니다.`,
        change: { legit: +10 }, cause: 'choice' },
      { text: `그러자 다른 지역들도 들고일어났습니다. "우리도 동의한 적 없다!"`,
        stageFn: (game) => ({ globe: { building: 1, cracked: true, focus: game.ids['독립국'],
                                       glow: game.idList('동조국').concat(game.ids['독립국']) } }) },
      { text: `독립 요구가 세계 곳곳으로 번지고, 세계정부를 향한 공격이 시작되었습니다.`,
        stageFn: (game) => ({ globe: { building: 0.8, cracked: true, tint: 'red',
                                       focus: game.ids['동조국0'], gray: game.idList('동조국') } }),
        change: { peace: -50, coop: -45 }, cause: 'choice' },
    ],
    next: 'E2',
  },

  A7: {
    stage: { view: 'globe', globe: { building: 0.18 }, note: `📅 회의 1일차` },
    lines: [
      { text: `모든 나라 대표가 모여 세계정부 헌장을 논의하기 시작했습니다.`,
        change: { legit: +20 }, cause: 'choice' },
      { text: `회의는 계속됩니다. 그동안에도 분쟁은 이어지고 있습니다.`,
        days: ['📅 회의 1일차', '📅 회의 30일차', '📅 회의 100일차', '📅 회의 1년차', '📅 회의 3년차'],
        change: { coop: -5 }, cause: 'choice' },
    ],
    next: 'A8',
  },

  A8: {
    event: true,
    stage: { view: 'globe', globe: { building: 0.18 }, note: `📅 회의 3년차` },
    lines: [
      { text: `⚠️ 일부 강대국이 반대를 선언했습니다. "우리의 군대와 예산을 세계정부에 넘길 수는 없다."` },
      { text: `몇몇 나라는 회의에서 아예 빠졌습니다.`,
        change: { coop: -15, legit: -10 }, cause: 'event' },
      { text: `세계정부 헌장은 끝내 완성되지 못했습니다.` },
    ],
    next: 'E3',
  },


  /* ===== 세계정부 없는 길: 각자도생 (B1 ~ B3) ===== */

  B1: {
    // '세우지 않는다'를 고르면 국경선이 또렷해진다 — 각자의 주권을 지킨다는 뜻
    stage: { view: 'globe', globe: { bordersHot: 1 } },
    lines: [
      { text: `나라들은 세계정부 없이, 각자의 주권을 지키기로 했습니다.` },
    ],
    question: `세계정부 없이, 지금의 분쟁과 위기에 어떻게 대응할까요?`,
    key: 'q2',
    choices: [
      { icon: '🧍', label: `지금처럼 각자 알아서`, desc: `각 나라가 자기 이익을 먼저 지킨다`,
        value: 'alone', path: `각자 알아서`, next: 'B2' },
      { icon: '🤝', label: `새로운 협력 체제를 만든다`, desc: `SDG17처럼, 주권을 지키면서 함께 약속한다`,
        value: 'partner', path: `새로운 협력 체제`, next: 'C0' },
    ],
  },

  B2: {
    stage: { view: 'globe', globe: { bordersHot: 1, tint: 'murkylight' } },
    lines: [
      { text: `각 나라는 자기 나라를 먼저 지키기로 했습니다.` },
      { text: `군사적 긴장은 높아지고, 멈췄던 분쟁이 다시 시작된 곳도 있습니다. 어떤 분쟁은 협상으로, 어떤 분쟁은 큰 희생 끝에야 멈췄습니다.` },
      { text: `원조 예산은 줄어들고, 탄소 감축 약속은 뒤로 밀렸습니다.`,
        stage: { globe: { bordersHot: 1, tint: 'murky', trash: 0.6, ice: 0.7 } },
        change: { peace: -20, coop: -20 }, cause: 'choice' },
    ],
    next: 'B3',
  },

  B3: {
    // 폭염과 홍수가 일어날 법한 나라를 무작위로 고른다 (북극에 폭염 같은 일이 없도록 목록을 나눠 뒀다)
    onEnter(game) {
      game.pickList('폭염', pickSome(CLIMATE.heat, 3).map(id => WORLD.byId[id]).filter(Boolean));
      game.pickList('홍수', pickSome(CLIMATE.flood, 3).map(id => WORLD.byId[id]).filter(Boolean));
    },
    event: true,
    stageFn: (game) => ({
      view: 'globe',
      globe: { bordersHot: 1, tint: 'murky', trash: 0.6, ice: 0.7, focus: game.ids['폭염0'],
               heat: game.idList('폭염'), flood: game.idList('홍수'),
               labels: [{ id: game.ids['폭염0'], kind: 'danger' }, { id: game.ids['홍수0'] }] },
    }),
    lines: [
      { text: `⚠️ 대규모 기후재난이 발생했습니다. {폭염0:과} {폭염1:을} 폭염이 덮쳤고, {홍수0:과} {홍수1:은} 큰 홍수에 잠겼습니다.`,
        note: `피해 지역은 실제로 폭염·홍수가 자주 일어나는 나라 중에서 무작위로 뽑았어요.` },
      { text: `각 나라는 자국의 피해를 복구하느라 바빴고, 대응할 힘이 없는 나라들은 홀로 남겨졌습니다.`,
        stageFn: (game) => ({ globe: { bordersHot: 1, tint: 'murky2', trash: 1, ice: 0.3,
                                       focus: game.ids['홍수0'],
                                       heat: game.idList('폭염'), flood: game.idList('홍수'),
                                       labels: [{ id: game.ids['홍수0'], kind: 'danger' }] } }),
        change: { peace: -10, coop: -15 }, cause: 'event' },
    ],
    next: 'E4',
  },


  /* ===== 세계정부 없는 길: 파트너십 회의 (C0 ~ C7) ===== */

  C0: {
    // 협약에 참여하는 나라를 지구 곳곳에서 무작위로 8개 고르고, 그 사이를 선으로 잇는다
    onEnter(game) {
      // 참여국0 = 정권이 바뀌는 나라 (전 세계에서 무작위)
      // 참여국1 = 협약을 떠나는 강대국 (OECD 회원국 중에서 무작위)
      // 나머지 6개국도 전 세계에서 무작위
      const big = randomOECD(1)[0];
      const others = randomLands(7, big ? [big.id] : []);
      const partners = [others[0], big, ...others.slice(1)].filter(Boolean);
      game.pickList('참여국', partners);
      const ids = partners.map(p => p.id);
      const arcs = [];
      for (let i = 0; i < ids.length; i++) arcs.push([ids[i], ids[(i + 1) % ids.length]]);
      arcs.push([ids[0], ids[3]], [ids[1], ids[5]], [ids[2], ids[6]], [ids[4], ids[7]]);
      game.arcs = arcs;
    },
    stage: { view: 'meeting' },
    lines: [
      { text: `세계 각 대륙의 대표들이 한자리에 모였습니다.`,
        change: { coop: +5 }, cause: 'choice' },
      { text: `당신은 이 회의를 이끄는 의장입니다. 대표들의 질문에 답해 협약을 완성하세요.` },
      { card: 'treaty' },
      { text: `협약의 내용은 정해졌습니다. 이제 이 약속을 '어떻게' 지킬지 정할 차례입니다.`, fold: true },
    ],
    next: 'C1',
  },

  C1: {
    who: 'europe',
    tag: `SDG 17.15 각국의 정책 재량과 리더십 존중`,
    question: `"이 협약의 규칙은 누가 정해야 할까요?"`,
    key: 'c1',
    treaty: true,
    choices: [
      { icon: '💪', label: `힘과 책임이 큰 강대국들이 정한다`, desc: `빠르게 정해지지만, 다른 나라의 목소리는 작아집니다`,
        value: 'powers', path: `규칙: 강대국들이`,
        change: { peace: +5, coop: +10, legit: -15 },
        after: [
          { who: 'asia', text: `"빨리 정해져서 다행이네요."` },
          { who: 'africa', small: true, text: `…우리 의견은 어디에 들어간 거죠?` },
        ] },
      { icon: '🌍', label: `모든 나라가 함께 정한다`, desc: `오래 걸리지만, 모두가 자기 규칙이라고 느낍니다`,
        value: 'all', path: `규칙: 모든 나라가 함께`,
        change: { coop: -5, legit: +15 },
        after: [
          { who: 'oceania', text: `"시간은 걸리겠지만, 작은 나라인 우리 목소리도 들어가겠군요."` },
          { who: 'america', text: `"좋습니다. 그렇게 하도록 하죠."` },
        ] },
    ],
    next: 'C2',
  },

  C2: {
    who: 'asia',
    tag: `SDG 17.16·17.17 다양한 이해관계자 파트너십`,
    question: `"그렇다면 이 협력에는 누가 참여해야 할까요?"`,
    key: 'c2',
    treaty: true,
    choices: [
      { icon: '🏛️', label: `각국 정부만 참여한다`, desc: `결정이 빠르고 깔끔합니다`,
        value: 'gov', path: `참여: 각국 정부만`,
        change: { coop: +10, legit: -15 },
        after: [
          { who: 'europe', text: `"정부끼리 하면 빠르겠군요."` },
          { who: 'america', small: true, text: `…현장에서 일하는 사람들의 목소리는 빠지겠지만요.` },
        ] },
      { icon: '👥', label: `정부와 기업, 시민사회·NGO도 함께한다`, desc: `조율은 느리지만, 더 많은 자원과 지지가 모입니다`,
        value: 'multi', path: `참여: 정부·기업·시민사회`,
        // 국내 신뢰도 +10은 아직 숨겨진 채로 움직인다 (🔒 칸만 살짝 흔들림)
        change: { coop: -5, legit: +15, trust: +10 },
        after: [
          { who: 'africa', text: `"현장에서 일하는 단체들이 함께하면 큰 힘이 됩니다."` },
          { who: 'europe', text: `"회의가 길어지겠지만, 그렇게 하죠."` },
        ] },
    ],
    next: 'C3',
  },

  C3: {
    who: 'africa',
    tag: `SDG 17.18 신뢰할 수 있는 데이터`,
    question: `"약속을 어기면요? 강제할 기구도 없는데, 힘센 나라가 약속을 어기면 어떻게 합니까?"`,
    key: 'c3',
    treaty: true,
    choices: [
      { icon: '🤫', label: `(소곤소곤) 그냥 넘어가도록 하죠`, desc: `괜한 다툼은 피할 수 있습니다`,
        value: 'ignore', path: `위반 시: 그냥 넘어감`,
        change: { peace: +5, coop: -20, legit: -15 },
        after: [
          { who: 'some', text: `"흠… 뭔가 걸리는 구석이 있지만, 그렇게 하도록 하죠."` },
        ] },
      { icon: '📊', label: `이행 상황을 공개하고, 어기면 단계적으로 불이익을 주죠`, desc: `처음엔 경고, 반복되면 더 무거운 불이익`,
        value: 'graduated', path: `위반 시: 공개 + 단계적 불이익`,
        change: { peace: -5, coop: +15, legit: +15 },
        after: [
          { who: 'america', text: `"괜찮은 방안인 것 같습니다."` },
          { who: 'asia', text: `"모두가 볼 수 있다면, 약속을 어기기 어렵겠네요."` },
        ] },
      { icon: '⚔️', label: `어기면 즉시 강력하게 제재하죠`, desc: `확실하지만, 반발이 클 수 있습니다`,
        value: 'sanction', path: `위반 시: 즉시 강력한 제재`,
        change: { peace: -10, coop: +15, legit: -30 },
        after: [
          { who: 'europe', text: `"확실하긴 하군요."` },
          { who: 'africa', small: true, text: `…그런데 그 제재는 누가 결정하죠? 결국 힘센 나라 아닌가요?` },
        ] },
    ],
    next: 'C4',
  },

  C4: {
    who: 'america',
    tag: `SDG 17.14 지속가능발전을 위한 정책 일관성`,
    question: `"마지막으로, 이 협약을 확정하기 전에 어디까지 동의를 받아야 할까요?"`,
    key: 'c4',
    treaty: true,
    choices: [
      { icon: '⚡', label: `각국 정부끼리 빠르게 결정한다`, desc: `오늘 바로 서명할 수 있습니다`,
        value: 'fast', path: `확정: 정부끼리 빠르게`,
        // 국내 신뢰도 변화는 C5에서 공개될 때 보여준다
        change: { coop: +10, trust: -30 },
        after: [
          { who: 'europe', text: `"좋습니다. 오늘 바로 서명하죠!"` },
          { text: `각국 정부가 협약에 서명했습니다. 대부분의 국민은 이 협약이 있다는 사실을 뉴스로 처음 알았습니다.` },
        ] },
      { icon: '🗳️', label: `국민과 NGO에 내용과 비용을 알리고, 국회 논의를 거쳐 동의받는다`, desc: `시간이 걸리지만, 국민이 함께 정한 약속이 됩니다`,
        value: 'ratify', path: `확정: 국민 동의 + 국회 논의`,
        change: { coop: +5, trust: +30 },
        after: [
          { who: 'asia', text: `"몇 달은 걸리겠군요. 그래도 그게 맞겠죠."` },
          { text: `각국 국회에서 협약이 논의되고, 시민들은 공청회에서 의견을 냈습니다. 협약은 국민의 동의를 얻어 확정되었습니다.` },
        ] },
    ],
    next: 'C5',
  },

  C5: {
    reveal: {
      title: `🔓 새로운 변수 발견: 국내 신뢰도`,
      lines: [
        `나라와 나라 사이의 약속도, 결국 각 나라 국민이 지지해야 지켜집니다.`,
        `국내 신뢰도는 국민이 이 협약을 얼마나 '우리의 약속'으로 여기는지를 나타냅니다.`,
      ],
      note: `사실 이 변수는 처음부터 움직이고 있었습니다.`,
      button: '확인',
    },
    next: 'C6',
  },

  C6: {
    event: true,
    stageFn: (game) => ({
      view: 'globe',
      globe: { arcs: game.arcs, focus: game.ids['참여국0'], glow: [game.ids['참여국0']],
               labels: [{ id: game.ids['참여국0'] }] },
    }),
    lines: [
      { text: `⚠️ 몇 년 뒤, 협약에 참여한 {참여국0:에서} 선거가 열려 정권이 바뀌었습니다.`, note: RANDOM_NOTE },
      { text: `새 정부는 협약을 다시 검토하겠다고 발표했습니다.` },
    ],
    check: 'trust',
    results: [
      { when: (game) => game.vars.trust >= 50,          // 국내 신뢰도 50 이상
        lines: [
          { text: `{참여국0:의} 국민 대다수가 협약을 지지했습니다. 새 정부도 '국민이 함께 정한 약속'이라며 협약을 유지하기로 했습니다.`,
            change: { peace: +5, coop: +5 }, cause: 'event' },
        ] },
      { when: (game) => game.vars.trust < 50,           // 국내 신뢰도 50 미만
        lines: [
          { text: `{참여국0:의} 새 정부는 '국민이 동의한 적 없는 약속'이라며 협약 탈퇴를 선언했습니다. 국민 대부분은 반대하지 않았습니다. 처음부터 잘 몰랐던 약속이었기 때문입니다.`,
            stageFn: (game) => ({ globe: { arcs: game.cutArcs(game.ids['참여국0']), focus: game.ids['참여국0'],
                                           gray: [game.ids['참여국0']],
                                           labels: [{ id: game.ids['참여국0'], kind: 'danger' }] } }),
            change: { peace: -5, coop: -20 }, cause: 'event', flag: 'domesticFail' },
        ] },
    ],
    next: 'C7',
  },

  C7: {
    event: true,
    stageFn: (game) => ({
      view: 'globe',
      globe: { arcs: game.liveArcs(), focus: game.ids['참여국1'], glow: [game.ids['참여국1']],
               labels: [{ id: game.ids['참여국1'], kind: 'danger' }] },
    }),
    lines: [
      { text: `⚠️ 이번에는 협약에 참여한 강대국 {참여국1:이} 탈퇴를 선언했습니다. "이 협약에서 우리만 손해를 본다."` },
      { text: `다른 나라들은 어떻게 할까요?` },
    ],
    check: 'legit',
    results: [
      { when: (game) => game.choices.c3 === 'sanction',  // C3에서 즉시 제재를 골랐으면 (깜빡임 없이)
        noBlink: true,
        lines: [
          { text: `협약 회원국들은 규칙대로 {참여국1:에} 즉시 강력한 제재를 내렸습니다.` },
          { text: `그러자 다른 나라들도 반발했습니다. "이건 협약이 아니라 또 하나의 세계정부다!" 제재를 두려워한 나라들이 줄줄이 협약을 떠났습니다.`,
            stageFn: (game) => ({ globe: { arcs: game.cutArcs(game.ids['참여국1'], 4), tint: 'graylight',
                                           gray: game.idList('참여국', 1, 5) } }),
            change: { peace: -10, coop: -30 }, cause: 'event' },
        ] },
      { when: (game) => game.vars.legit >= 80,           // 정당성 80 이상
        lines: [
          { text: `나머지 나라들은 흔들리지 않았습니다. 모두가 함께 만든 공정한 규칙이었기 때문입니다. 협약은 {참여국1:과} 함께하지 못하게 되었지만 그대로 이어졌고, 몇몇 분쟁 지역에서 중재가 시작되었습니다.`,
            stageFn: (game) => ({ globe: { arcs: game.cutArcs(game.ids['참여국1']), gray: [game.ids['참여국1']],
                                           hide: ['sahel', 'drc', 'ssudan'], tint: 'blue' } }),
            change: { peace: +15, coop: -5 }, cause: 'event' },
        ] },
      { when: (game) => game.vars.legit >= 50,           // 정당성 50 ~ 79
        lines: [
          { text: `몇몇 나라가 {참여국1:을} 따라 협약을 떠났습니다. "어차피 공정한 규칙도 아니었다"는 이유였습니다.`,
            stageFn: (game) => ({ globe: { arcs: game.cutArcs(game.ids['참여국1'], 2),
                                           gray: game.idList('참여국', 1, 3) } }),
            change: { peace: -5, coop: -15 }, cause: 'event' },
        ] },
      { when: (game) => true,                            // 나머지 (정당성 50 미만)
        lines: [
          { text: `기다렸다는 듯 많은 나라가 줄줄이 협약을 떠났습니다. 처음부터 아무도 이 규칙을 자기 것이라 여기지 않았습니다.`,
            stageFn: (game) => ({ globe: { arcs: game.cutArcs(game.ids['참여국1'], 5), tint: 'graylight',
                                           gray: game.idList('참여국', 1, 6) } }),
            change: { peace: -10, coop: -25 }, cause: 'event' },
        ] },
    ],
    next: 'JUDGE',
  },
};


/* ⑨ 파트너십 루트 엔딩 판정
   C7이 끝나면 위에서부터 차례로 확인해서, 처음 맞는 엔딩으로 간다.
   (세계정부·각자도생 루트는 선택으로 엔딩이 정해져서 판정이 없다) */
function judgeEnding(game) {
  if (game.choices.c3 === 'sanction') return 'E5';   // 🤯 또 하나의 세계정부?
  if (game.vars.legit < 20)           return 'E6';   // 💀 이름뿐인 협력
  if (game.vars.legit < 80)           return 'E7';   // 🤯 흔들리는 협력
  if (game.domesticFail)              return 'E8';   // 🤯 안에서 무너진 협력
  return 'E9';                                       // 🌱 불완전하지만 지속되는 협력
}
