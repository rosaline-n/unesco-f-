/* =========================================================
   globe.js — 돌아가는 지구
   ---------------------------------------------------------
   라이브러리를 쓰지 않고 <canvas>에 직접 그린다.
   그래서 파일이 가볍고, 나라 하나하나를 내 마음대로 칠할 수 있다.

   원리 (정사도법 / orthographic projection)
     지구 위의 한 점은 경도·위도로 나타난다.
     그 점을 반지름 1인 공 위의 (X, Y, Z) 좌표로 바꾸고,
     보는 방향에 맞춰 공을 돌린 다음,
     화면에는 X와 Y만 쓰고 Z는 "앞에 있나 뒤에 있나"를 판단하는 데만 쓴다.
       Z > 0  → 지금 보이는 면
       Z ≤ 0  → 지구 반대편이라 안 보임

   빠르게 만든 방법
     경도·위도 → (X, Y, Z) 계산에는 sin·cos가 필요한데, 이건 처음에 한 번만 해둔다.
     돌릴 때는 곱셈만 하면 돼서 1초에 60번 그려도 끊기지 않는다.

   차례
     1. 도움 함수        5. 그리기
     2. 지도 데이터 읽기  6. 손가락·마우스 조작
     3. 지구 하나 만들기  7. 공용 애니메이션 루프
     4. 보여줄 모습(look)
   ========================================================= */
'use strict';


/* ---------- 1. 도움 함수 ---------- */

const RAD = Math.PI / 180;

// a와 b 사이를 t(0~1)만큼 간 값
function lerp(a, b, t) { return a + (b - a) * t; }

// 0~1 사이로 자르기
function sat(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

// 처음엔 빠르고 끝에서 천천히 (애니메이션을 자연스럽게)
function ease(t) { return 1 - Math.pow(1 - sat(t), 3); }

// 색을 [r, g, b, a]로 바꾸기
function rgba(r, g, b, a) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }

// 목록에서 n개를 겹치지 않게 무작위로 뽑기
function pickSome(list, n) {
  const copy = list.slice();
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}


/* ---------- 2. 지도 데이터 읽기 ---------- */

const WORLD = {
  ready: false,
  lands: [],        // 나라 목록
  byId: {},         // 코드로 나라 찾기
  pool: [],         // 무작위로 뽑을 수 있는 나라
};

// data/world.geo.json을 읽어서, 경도·위도를 공 위의 좌표로 미리 바꿔 둔다
async function loadWorld(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('지도 파일을 읽지 못했어요: ' + res.status);
  const geo = await res.json();

  for (const f of geo.features) {
    const p = f.properties;
    const rings = [];
    for (const poly of f.geometry.coordinates) {
      for (const ring of poly) {
        const n = ring.length;
        const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const lon = ring[i][0] * RAD, lat = ring[i][1] * RAD;
          const cs = Math.cos(lat);
          X[i] = cs * Math.sin(lon);   // 동서
          Y[i] = Math.sin(lat);        // 남북
          Z[i] = cs * Math.cos(lon);   // 앞뒤
        }
        rings.push({ n, X, Y, Z });
      }
    }
    const land = { id: f.id, ko: p.ko, en: p.en, c: p.c, area: p.a, pool: p.pool === 1, rings };
    WORLD.lands.push(land);
    WORLD.byId[f.id] = land;
    if (land.pool) WORLD.pool.push(land);
  }
  WORLD.ready = true;
  return WORLD;
}

/*
   전 세계 나라 중 무작위로 n개.
   목록에 있는 모든 나라가 똑같은 확률로 뽑힌다.
   (분쟁 중인 나라와 지도에서 점으로도 안 보이는 아주 작은 나라는 목록에서 빼 두었다)
*/
function randomLands(n, exclude = []) {
  const can = WORLD.pool.filter(l => !exclude.includes(l.id));
  return pickSome(can, n);
}

/* OECD 회원국 38개국 (2026년 기준). C7에서 협약을 떠나는 '강대국'을 여기서 고른다. */
const OECD = [
  'AUT', 'BEL', 'CAN', 'CHL', 'COL', 'CRI', 'CZE', 'DNK', 'EST', 'FIN',
  'FRA', 'DEU', 'GRC', 'HUN', 'ISL', 'IRL', 'ISR', 'ITA', 'JPN', 'KOR',
  'LVA', 'LTU', 'LUX', 'MEX', 'NLD', 'NZL', 'NOR', 'POL', 'PRT', 'SVK',
  'SVN', 'ESP', 'SWE', 'CHE', 'TUR', 'GBR', 'USA', 'AUS',
];

// OECD 회원국 중 무작위로 n개 (역시 모두 같은 확률)
function randomOECD(n, exclude = []) {
  const can = WORLD.pool.filter(l => OECD.includes(l.id) && !exclude.includes(l.id));
  return pickSome(can, n);
}

// 나라 코드 목록 → 나라 목록 (없는 코드는 건너뜀)
function landsOf(ids) {
  return (ids || []).map(id => WORLD.byId[id]).filter(Boolean);
}


/* ---------- 3. 지구 하나 만들기 ---------- */

const GLOBES = [];   // 지금 살아 있는 지구들 (7번 애니메이션 루프가 돌려 준다)

/*
   canvas : 그릴 <canvas>
   opts   : { spin: 저절로 도는 속도(도/초), interactive: 손으로 돌릴 수 있나,
              lon/lat: 처음 보는 방향, alpha: 전체 투명도 }
*/
function makeGlobe(canvas, opts = {}) {
  const g = {
    canvas,
    ctx: canvas.getContext('2d'),
    spin: opts.spin === undefined ? 4 : opts.spin,   // 도/초
    interactive: opts.interactive !== false,
    still: opts.still === true,                      // true면 저절로 움직이지 않음
    alpha: opts.alpha === undefined ? 1 : opts.alpha,
    lon: opts.lon === undefined ? 20 : opts.lon,     // 지금 화면 가운데에 오는 경도
    lat: opts.lat === undefined ? 18 : opts.lat,     // 위도
    zoom: 1,
    w: 0, h: 0, cx: 0, cy: 0, R: 10,
    dragging: false, touched: false,
    look: freshLook(),
    anim: [],            // 돌고 있는 애니메이션들
    onTapMarker: null,   // 분쟁 점을 눌렀을 때 부를 함수
    alive: true,
    needsDraw: true,
    time: 0,
  };

  fit(g);
  if (g.interactive) bindPointer(g);
  GLOBES.push(g);
  return g;
}

function destroyGlobe(g) {
  g.alive = false;
  const i = GLOBES.indexOf(g);
  if (i >= 0) GLOBES.splice(i, 1);
}

// 캔버스 크기를 화면에 맞춘다 (고해상도 화면에서도 선명하게)
function fit(g) {
  const box = g.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(box.width)), h = Math.max(1, Math.round(box.height));
  if (w === g.w && h === g.h && g.canvas.width === w * dpr) return;
  g.w = w; g.h = h;
  g.canvas.width = w * dpr;
  g.canvas.height = h * dpr;
  g.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.cx = w / 2; g.cy = h / 2;
  g.R = Math.min(w, h) / 2 - 2;
  g.needsDraw = true;
}


/* ---------- 4. 보여줄 모습 (look) ---------- */

/*
   지구의 "지금 모습"을 담는 상자.
   scenes.js에서 stage.globe로 넘긴 값이 여기로 들어온다.

     tint     : 지구 전체 색 덮개 ('gray' 'red' 'murky' 'blue' ...)
     markers  : 분쟁 점을 보여줄까 (0~1, 0이면 안 보임)
     hide     : 숨길 분쟁 id 목록 (분쟁이 줄어드는 연출)
     gray     : 회색으로 변한 나라 코드 목록 (반발한 나라)
     glow     : 밝게 빛나는 나라 코드 목록
     arcs     : 나라 사이 연결선 [[나라A, 나라B], ...]
     building : 세계정부 건물 크기 (0~1)
     cracked  : 건물에 금이 갔나
     cage     : 지구를 감싼 철창 (E1)
     heat     : 폭염이 난 나라 코드 목록
     flood    : 홍수가 난 나라 코드 목록
     ice      : 북극 얼음 크기 (1이 원래, 0이면 다 녹음)
     trash    : 바다 쓰레기 (0~1)
     labels   : 지구 위에 붙일 이름표 [{ id, text, kind }]
     focus    : 이 나라가 화면 가운데로 오도록 지구가 천천히 돌아간다
                (무작위로 뽑힌 나라를 꼭 보여 줘야 할 때 쓴다)
*/
function freshLook() {
  return {
    tint: null, markers: 1, hide: [], gray: [], glow: [], arcs: [],
    building: 0, cracked: false, cage: false, bordersHot: 0,
    heat: [], flood: [], ice: 1, trash: 0, labels: [], focus: null,
  };
}

// 지구를 처음 상태로 되돌린다 (새 판을 시작할 때)
function resetLook(g) {
  if (!g) return;
  g.look = freshLook();
  g.shown = { building: 0, markers: 1, ice: 1, trash: 0, tint: [0, 0, 0, 0] };
  g.from = { ...g.shown };
  g.blendDur = 0;
  g.anim = [];
  g.turn = null;
  g.baseKey = '';
  g.needsDraw = true;
}

const TINTS = {
  gray:       [70, 70, 70, 0.40],
  graylight:  [90, 90, 90, 0.18],
  red:        [214, 69, 69, 0.38],
  murky:      [181, 151, 60, 0.30],
  murkylight: [181, 151, 60, 0.16],
  murky2:     [150, 115, 30, 0.46],
  blue:       [47, 111, 219, 0.26],
};

// 분쟁 점 색. 국가 간 분쟁은 분홍 계열 4가지를 쓰되 서로 확실히 구별되게 골랐다.
const DOT = {
  orange: '#F28C28',   // 내전
  pink1: '#E8508F',    // 진한 분홍
  pink2: '#F9A8D4',    // 연한 분홍
  pink3: '#9D174D',    // 와인색
  pink4: '#FB7185',    // 산호색
  green: '#9BD770',    // 분단·휴전
  yellow: '#F5D547',   // 군사적 긴장
};

// 지구 모습 바꾸기. animate가 true면 부드럽게 변한다.
function setLook(g, patch, animate = true) {
  const old = g.look;
  const next = Object.assign(freshLook(), old, patch);

  // 회색으로 변하는 나라는 한꺼번에 말고 하나씩 번지게 한다
  const addedGray = next.gray.filter(id => !old.gray.includes(id));
  if (animate && addedGray.length) {
    addedGray.forEach((id, i) => {
      g.anim.push({ kind: 'gray', id, start: g.time + i * 0.25, dur: 0.8 });
    });
  }
  const addedArc = next.arcs.filter(a => !old.arcs.some(b => b[0] === a[0] && b[1] === a[1]));
  if (animate && addedArc.length) {
    addedArc.forEach((a, i) => {
      g.anim.push({ kind: 'arc', key: a[0] + '-' + a[1], start: g.time + i * 0.06, dur: 0.5 });
    });
  }
  for (const key of ['heat', 'flood']) {
    const added = next[key].filter(id => !old[key].includes(id));
    if (animate && added.length) {
      added.forEach((id, i) => g.anim.push({ kind: key, id, start: g.time + i * 0.4, dur: 1.2 }));
    }
  }

  // 꼭 보여 줘야 할 나라가 있으면 지구가 그쪽으로 천천히 돌아간다
  if (next.focus && next.focus !== old.focus) {
    const land = WORLD.byId[next.focus];
    if (land) {
      let want = land.c[0];
      let turn = want - g.lon;                       // 가까운 쪽으로 돌기
      while (turn > 180) turn -= 360;
      while (turn < -180) turn += 360;
      g.turn = {
        fromLon: g.lon, toLon: g.lon + turn,
        fromLat: g.lat, toLat: Math.max(-55, Math.min(55, land.c[1])),
        start: g.time, dur: animate ? 1.1 : 0,
      };
    }
  }
  if (!next.focus) g.turn = null;

  // 천천히 변하는 값들
  g.from = {
    tint: currentTint(g), building: g.shown ? g.shown.building : 0,
    markers: g.shown ? g.shown.markers : 1, ice: g.shown ? g.shown.ice : 1,
    trash: g.shown ? g.shown.trash : 0,
  };
  g.shown = g.shown || { building: 0, markers: 1, ice: 1, trash: 0, tint: [0, 0, 0, 0] };
  g.blendStart = g.time;
  g.blendDur = animate ? 0.9 : 0;
  g.look = next;
  g.needsDraw = true;
}

function currentTint(g) {
  return (g.shown && g.shown.tint) || [0, 0, 0, 0];
}

// 애니메이션 진행도 꺼내기 (없으면 1 = 이미 다 됨)
function animT(g, kind, key) {
  for (const a of g.anim) {
    if (a.kind === kind && (a.id === key || a.key === key)) {
      return ease((g.time - a.start) / a.dur);
    }
  }
  return 1;
}


/* ---------- 5. 그리기 ---------- */

/*
   그리기는 두 겹으로 나눠 놓았다.
     아래 겹(base) : 바다·국경·나라 색처럼 잘 안 변하는 것 → 따로 저장해 두고 다시 쓴다
     위 겹         : 깜빡이는 분쟁 점, 연결선처럼 매 순간 변하는 것
   이렇게 하면 지구를 돌리지 않을 때는 땅을 다시 그릴 필요가 없어서 훨씬 가볍다.
*/
function drawGlobe(g) {
  const { ctx, cx, cy, w, h } = g;
  const R = g.R * g.zoom;
  ctx.clearRect(0, 0, w, h);
  if (!WORLD.ready) { drawLoading(g); return; }

  // 지금 보는 방향에 맞춘 회전 값 (한 번 그릴 때 4번만 계산하면 된다)
  const P = {
    cx, cy, R,
    sl: Math.sin(g.lon * RAD), cl: Math.cos(g.lon * RAD),
    sp: Math.sin(g.lat * RAD), cp: Math.cos(g.lat * RAD),
  };

  // 천천히 변하는 값 계산
  const t = g.blendDur ? ease((g.time - g.blendStart) / g.blendDur) : 1;
  const L = g.look, F = g.from || {};
  const want = L.tint ? TINTS[L.tint] || [0, 0, 0, 0] : [0, 0, 0, 0];
  const tint = [0, 1, 2, 3].map(i => lerp((F.tint || [0, 0, 0, 0])[i], want[i], t));
  const building = lerp(F.building || 0, L.building, t);
  const markers = lerp(F.markers === undefined ? 1 : F.markers, L.markers, t);
  const ice = lerp(F.ice === undefined ? 1 : F.ice, L.ice, t);
  const trash = lerp(F.trash || 0, L.trash, t);
  g.shown = { tint, building, markers, ice, trash };

  // ── 아래 겹: 바뀐 게 있을 때만 다시 그린다 ──
  const key = [g.lon.toFixed(2), g.lat.toFixed(2), g.zoom.toFixed(2), w, h,
               tint.join(), ice.toFixed(2), trash.toFixed(2),
               L.gray.join(), L.glow.join(), L.bordersHot, g.anim.length].join('|');
  if (key !== g.baseKey) {
    g.baseKey = key;
    drawBase(g, P, tint, ice, trash);
  }

  ctx.save();
  ctx.globalAlpha = g.alpha;
  ctx.drawImage(g.base, 0, 0, w, h);

  // ── 위 겹 ──
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  for (const id of L.heat) drawBlob(ctx, P, id, '#FF5A2B', animT(g, 'heat', id), g.time);
  for (const id of L.flood) drawBlob(ctx, P, id, '#2E7FE8', animT(g, 'flood', id), g.time);
  for (const a of L.arcs) drawArc(g, P, a);
  if (markers > 0.01) drawMarkers(g, P, markers);
  if (L.cage) drawCage(ctx, cx, cy, R);
  ctx.restore();

  drawRim(ctx, cx, cy, R);
  if (building > 0.01) drawBuilding(g, P, building, L.cracked);
  for (const lb of L.labels) drawLabel(g, P, lb);
  ctx.restore();
}

// 아래 겹 그리기 (화면 밖 캔버스에)
function drawBase(g, P, tint, ice, trash) {
  if (!g.base) g.base = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (g.base.width !== g.canvas.width || g.base.height !== g.canvas.height) {
    g.base.width = g.canvas.width; g.base.height = g.canvas.height;
  }
  const b = g.base.getContext('2d');
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.clearRect(0, 0, g.w, g.h);
  const { cx, cy, R } = P;

  b.save();
  b.beginPath(); b.arc(cx, cy, R, 0, Math.PI * 2); b.clip();
  drawOcean(b, cx, cy, R);
  drawGraticule(b, P);
  drawLands(g, P, b);
  if (trash > 0.01) drawTrash(b, P, trash);
  drawShade(b, cx, cy, R);
  if (tint[3] > 0.002) {
    b.fillStyle = rgba(tint[0], tint[1], tint[2], tint[3]);
    b.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  drawIce(b, P, ice);
  b.restore();
}

function drawLoading(g) {
  const { ctx, cx, cy } = g;
  const R = g.R * 0.75;
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(g.time * 3);
  ctx.fillStyle = '#C3CEDA';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawOcean(ctx, cx, cy, R) {
  const grad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  grad.addColorStop(0, '#8FC2EE');
  grad.addColorStop(0.55, '#5B93CE');
  grad.addColorStop(1, '#2C5E96');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
}

// 경도선·위도선 (지구가 돌고 있다는 느낌을 준다)
function drawGraticule(ctx, P) {
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let lon = -180; lon < 180; lon += 30) {       // 세로줄
    let move = true;
    for (let lat = -80; lat <= 80; lat += 5) {
      const p = project(P, lon, lat);
      if (!p) { move = true; continue; }
      move ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      move = false;
    }
  }
  for (let lat = -60; lat <= 60; lat += 30) {        // 가로줄
    let move = true;
    for (let lon = -180; lon <= 180; lon += 5) {
      const p = project(P, lon, lat);
      if (!p) { move = true; continue; }
      move ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      move = false;
    }
  }
  ctx.stroke();
}

// 경도·위도 → 화면 좌표. 지구 뒤쪽이면 null
function project(P, lon, lat) {
  const la = lon * RAD, ph = lat * RAD, cs = Math.cos(ph);
  const X = cs * Math.sin(la), Y = Math.sin(ph), Z = cs * Math.cos(la);
  // 경도 방향으로 돌리기
  const x1 = X * P.cl - Z * P.sl;
  const z1 = X * P.sl + Z * P.cl;
  // 위도 방향으로 기울이기
  const y2 = Y * P.cp - z1 * P.sp;
  const z2 = Y * P.sp + z1 * P.cp;
  if (z2 <= 0) return null;
  return [P.cx + P.R * x1, P.cy - P.R * y2, z2];
}

// 나라들 칠하기
function drawLands(g, P, ctx) {
  const L = g.look;

  for (const land of WORLD.lands) {
    if (land.id === 'ATA') continue;              // 남극은 테두리에 늘어져 보여서 뺀다

    // 색 정하기
    let fill = '#8FB97F';                          // 보통 땅 (연두)
    const gi = L.gray.indexOf(land.id);
    if (gi >= 0) {
      const t = animT(g, 'gray', land.id);
      fill = mixColor([143, 185, 127], [122, 122, 122], t);
    }
    if (L.glow.includes(land.id)) fill = '#CFE8A8';

    const path = landPath(ctx, land, P);
    if (!path) continue;
    ctx.fillStyle = fill;
    ctx.fill();
    // 국경선. bordersHot이면 더 굵고 또렷해진다 ("각자의 주권을 지킨다")
    const hot = L.bordersHot || 0;
    ctx.strokeStyle = hot ? `rgba(255,255,255,${0.55 + 0.4 * hot})` : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.7 + 1.1 * hot;
    ctx.stroke();
  }
}

function mixColor(a, b, t) {
  return rgba(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), 1);
}

/*
   나라 하나의 모양을 path로 만든다.
   지구 뒤쪽으로 넘어간 점은 지구 테두리 쪽으로 밀어서 선이 끊기지 않게 한다.
   (위에서 동그라미로 잘라 놓았기 때문에 테두리 밖은 어차피 안 보인다)
*/
function landPath(ctx, land, P) {
  let any = false;
  ctx.beginPath();
  for (const ring of land.rings) {
    const { n, X, Y, Z } = ring;
    let visible = 0;
    for (let i = 0; i < n; i++) {
      const x1 = X[i] * P.cl - Z[i] * P.sl;
      const z1 = X[i] * P.sl + Z[i] * P.cl;
      const y2 = Y[i] * P.cp - z1 * P.sp;
      const z2 = Y[i] * P.sp + z1 * P.cp;
      let px, py;
      if (z2 > 0) {
        visible++;
        px = P.cx + P.R * x1; py = P.cy - P.R * y2;
      } else {
        const len = Math.hypot(x1, y2) || 1;       // 테두리로 밀기
        px = P.cx + P.R * x1 / len; py = P.cy - P.R * y2 / len;
      }
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    if (visible > 0) any = true;
    ctx.closePath();
  }
  return any;
}

// 분쟁 점
function drawMarkers(g, P, alpha) {
  const ctx = g.ctx, L = g.look;
  const size = Math.max(3.2, P.R * 0.022);
  for (const c of CONFLICTS) {
    if (L.hide.includes(c.id)) continue;
    const color = DOT[c.color] || '#F28C28';
    for (const [lon, lat] of c.spots) {
      const p = project(P, lon, lat);
      if (!p) continue;
      const near = 0.45 + 0.55 * p[2];                         // 가운데일수록 또렷하게
      const pulse = 0.5 + 0.5 * Math.sin(g.time * 3 + lon);     // 1.2초쯤에 한 번 깜빡
      ctx.globalAlpha = g.alpha * alpha * near;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p[0], p[1], size, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = g.alpha * alpha * near * (0.45 - 0.35 * pulse);
      ctx.beginPath(); ctx.arc(p[0], p[1], size * (1.6 + pulse * 1.3), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = g.alpha;
}

// 나라와 나라를 잇는 선 (협약 연결선)
function drawArc(g, P, pair) {
  const A = WORLD.byId[pair[0]], B = WORLD.byId[pair[1]];
  if (!A || !B) return;
  const t = animT(g, 'arc', pair[0] + '-' + pair[1]);
  const ctx = g.ctx;
  const steps = 28;
  const cut = pair[2] === 'cut';

  // 선을 두 번 긋는다: 굵고 흐린 선 위에 가늘고 또렷한 선 → 빛나 보인다
  const build = () => {
    ctx.beginPath();
    let move = true;
    for (let i = 0; i <= steps * t; i++) {
      const f = i / steps;
      const lon = lerpAngle(A.c[0], B.c[0], f), lat = lerp(A.c[1], B.c[1], f);
      const p = project(P, lon, lat);
      if (!p) { move = true; continue; }
      const lift = 1 + 0.12 * Math.sin(Math.PI * f);           // 가운데가 살짝 떠오르게
      const x = P.cx + (p[0] - P.cx) * lift, y = P.cy + (p[1] - P.cy) * lift;
      move ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      move = false;
    }
  };
  if (cut) ctx.setLineDash([5, 5]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = cut ? 'rgba(214,69,69,0.30)' : 'rgba(60,230,150,0.30)';
  ctx.lineWidth = Math.max(4, P.R * 0.028);
  build(); ctx.stroke();
  ctx.strokeStyle = cut ? 'rgba(255,120,110,0.95)' : 'rgba(180,255,215,0.95)';
  ctx.lineWidth = Math.max(1.6, P.R * 0.011);
  build(); ctx.stroke();
  ctx.setLineDash([]);
}

// 경도는 180도를 넘으면 반대로 도는 게 가까우므로 짧은 쪽으로 잇는다
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}

// 폭염(빨강) · 홍수(파랑) 번짐
function drawBlob(ctx, P, id, color, t, time) {
  const land = WORLD.byId[id];
  if (!land) return;
  const p = project(P, land.c[0], land.c[1]);
  if (!p) return;
  const base = Math.max(10, P.R * 0.055 * Math.sqrt(Math.max(land.area, 4) / 40));
  const r = base * (1.4 + 0.12 * Math.sin(time * 2.4)) * ease(t);
  const grad = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
  grad.addColorStop(0, color + 'CC');
  grad.addColorStop(0.55, color + '66');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
}

// 지구를 공처럼 보이게 하는 그늘 (왼쪽 위가 밝고 오른쪽 아래가 어둡다)
function drawShade(ctx, cx, cy, R) {
  const sh = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.15, cx, cy, R * 1.12);
  sh.addColorStop(0, 'rgba(255,255,255,0.30)');
  sh.addColorStop(0.45, 'rgba(255,255,255,0)');
  sh.addColorStop(0.78, 'rgba(10,25,50,0.10)');
  sh.addColorStop(1, 'rgba(8,20,45,0.42)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
}

// 북극 얼음 (size가 1이면 원래 크기, 0에 가까울수록 녹은 것)
function drawIce(ctx, P, size) {
  if (!project(P, 0, 90)) return;              // 북극이 지구 뒤쪽이면 안 그림
  const lat = 90 - 13 * Math.max(size, 0.15);
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 6) {
    const p = project(P, lon, lat);
    if (p) pts.push(p);
  }
  if (pts.length < 3) return;
  ctx.fillStyle = `rgba(250,253,255,${0.30 + 0.25 * size})`;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
}

// 바다 쓰레기 얼룩
const TRASH_SPOTS = [[-150, 32], [-40, 30], [75, -15], [150, -10], [-120, -20]];
function drawTrash(ctx, P, amount) {
  ctx.fillStyle = `rgba(120,120,110,${0.45 * amount})`;
  for (const [lon, lat] of TRASH_SPOTS) {
    const p = project(P, lon, lat);
    if (!p) continue;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], P.R * 0.16 * amount, P.R * 0.08 * amount, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 지구를 감싼 철창 (E1 평화로운 감옥)
function drawCage(ctx, cx, cy, R) {
  ctx.strokeStyle = 'rgba(28,32,38,0.6)';
  ctx.lineWidth = Math.max(2, R * 0.022);
  for (let i = -4; i <= 4; i++) {
    const x = cx + (i / 4.6) * R;
    const dy = Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx)));
    ctx.beginPath(); ctx.moveTo(x, cy - dy); ctx.lineTo(x, cy + dy); ctx.stroke();
  }
}

// 지구 테두리와 빛
function drawRim(ctx, cx, cy, R) {
  ctx.strokeStyle = 'rgba(20,40,70,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  const glow = ctx.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.1);
  glow.addColorStop(0, 'rgba(150,200,255,0.22)');
  glow.addColorStop(1, 'rgba(150,200,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2); ctx.fill();
}

// 세계정부 건물 (지구 꼭대기에 올라앉는다)
function drawBuilding(g, P, size, cracked) {
  const ctx = g.ctx;
  const w = P.R * 0.36 * size, h = w * 0.72;
  // 건물 바닥이 지구 위쪽 테두리에 살짝 걸치게. 화면 밖으로 나가면 아래로 내린다.
  const top = Math.max(3, P.cy - P.R - h * 0.18);
  const x = P.cx, y = top + h * 0.62;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = g.alpha * sat(size * 1.6);

  ctx.fillStyle = '#E7ECF2';
  ctx.strokeStyle = '#51607A';
  ctx.lineWidth = Math.max(1, w * 0.035);

  ctx.beginPath();                                    // 지붕
  ctx.moveTo(-w / 2, -h * 0.18); ctx.lineTo(0, -h * 0.62); ctx.lineTo(w / 2, -h * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.fillRect(-w / 2, -h * 0.18, w, h * 0.1);        // 상인방
  ctx.strokeRect(-w / 2, -h * 0.18, w, h * 0.1);
  for (let i = 0; i < 4; i++) {                       // 기둥
    const cw = w * 0.1, cx2 = -w / 2 + w * 0.12 + i * w * 0.25;
    ctx.fillRect(cx2, -h * 0.06, cw, h * 0.42);
    ctx.strokeRect(cx2, -h * 0.06, cw, h * 0.42);
  }
  ctx.fillRect(-w / 2, h * 0.36, w, h * 0.12);        // 기단
  ctx.strokeRect(-w / 2, h * 0.36, w, h * 0.12);

  if (cracked) {                                       // 금
    ctx.strokeStyle = '#2B3444';
    ctx.lineWidth = Math.max(1.4, w * 0.045);
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h * 0.5); ctx.lineTo(w * 0.04, -h * 0.1);
    ctx.lineTo(-w * 0.08, h * 0.12); ctx.lineTo(w * 0.06, h * 0.46);
    ctx.stroke();
  }
  ctx.restore();
}

// 지구 위 이름표 (무작위로 뽑힌 나라를 가리킬 때)
function drawLabel(g, P, lb) {
  const land = WORLD.byId[lb.id];
  if (!land) return;
  const p = project(P, land.c[0], land.c[1]);
  if (!p) return;
  const ctx = g.ctx;
  const text = lb.text || land.ko;
  ctx.font = '700 13px "Noto Sans KR", sans-serif';
  const tw = ctx.measureText(text).width;
  const lift = Math.max(26, P.R * 0.2);
  const bx = Math.min(Math.max(p[0], tw / 2 + 10), g.w - tw / 2 - 10);
  const by = Math.max(16, p[1] - lift);

  ctx.strokeStyle = 'rgba(27,42,74,0.75)';            // 가리키는 선
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(bx, by + 9); ctx.stroke();

  ctx.fillStyle = 'rgba(27,42,74,0.92)';              // 이름표
  roundRect(ctx, bx - tw / 2 - 8, by - 10, tw + 16, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, by + 1);
  ctx.textAlign = 'start';

  ctx.fillStyle = lb.kind === 'danger' ? '#FF7A59' : '#FFD54F';   // 가리키는 점
  ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


/* ---------- 6. 손가락·마우스 조작 ---------- */

function bindPointer(g) {
  const el = g.canvas;
  let lastX = 0, lastY = 0, moved = 0, id = null;

  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    el.setPointerCapture(id);
    g.dragging = true; g.touched = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
  });

  el.addEventListener('pointermove', (e) => {
    if (!g.dragging || e.pointerId !== id) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    const speed = 120 / (g.R * g.zoom);
    g.lon -= dx * speed;                              // 끄는 방향으로 돌아가게
    g.lat = Math.max(-80, Math.min(80, g.lat + dy * speed));
    g.needsDraw = true;
  });

  const end = (e) => {
    if (e.pointerId !== id) return;
    g.dragging = false; id = null;
    if (moved < 8) tap(g, e);                         // 거의 안 움직였으면 '눌렀다'로 본다
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    g.zoom = Math.max(1, Math.min(2.4, g.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    g.needsDraw = true;
  }, { passive: false });
}

// 분쟁 점을 눌렀는지 확인
function tap(g, e) {
  if (!g.onTapMarker || !WORLD.ready) return;
  const box = g.canvas.getBoundingClientRect();
  const mx = e.clientX - box.left, my = e.clientY - box.top;
  const R = g.R * g.zoom;
  const P = {
    cx: g.cx, cy: g.cy, R,
    sl: Math.sin(g.lon * RAD), cl: Math.cos(g.lon * RAD),
    sp: Math.sin(g.lat * RAD), cp: Math.cos(g.lat * RAD),
  };
  const reach = Math.max(18, R * 0.07);               // 손가락이 굵으니 넉넉하게
  let best = null, bestD = reach;
  for (const c of CONFLICTS) {
    if (g.look.hide.includes(c.id)) continue;
    for (const [lon, lat] of c.spots) {
      const p = project(P, lon, lat);
      if (!p) continue;
      const d = Math.hypot(p[0] - mx, p[1] - my);
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  if (best) g.onTapMarker(best);
}


/* ---------- 7. 공용 애니메이션 루프 ---------- */
// 지구가 여러 개 있어도 루프는 하나만 돈다 (배터리와 성능을 위해)

let lastFrame = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  for (const g of GLOBES) {
    if (!g.alive) continue;
    const box = g.canvas.getBoundingClientRect();
    const onScreen = box.width > 0 && box.bottom > -200 && box.top < innerHeight + 200;
    if (!onScreen) continue;                          // 안 보이는 지구는 쉰다

    fit(g);
    g.time += dt;

    // 보여 줘야 할 나라 쪽으로 돌아가는 중
    let turning = false;
    if (g.turn && !g.dragging) {
      const t = g.turn.dur ? ease((g.time - g.turn.start) / g.turn.dur) : 1;
      g.lon = lerp(g.turn.fromLon, g.turn.toLon, t);
      g.lat = lerp(g.turn.fromLat, g.turn.toLat, t);
      turning = t < 1;
      if (!turning) g.turn.done = true;
    }
    // 보여 줄 나라를 가리키는 동안과 그 뒤 3초는 멈춰 있다가, 다시 천천히 돈다
    const holding = g.turn && g.time < g.turn.start + g.turn.dur + 3;
    if (g.spin && !g.dragging && !g.touched && !turning && !holding) g.lon += g.spin * dt;
    g.anim = g.anim.filter(a => g.time < a.start + a.dur + 0.1);

    // still: true인 지구(엔딩 도감의 작은 지구들)는 가만히 있는다
    const moving = !g.still && (g.spin || g.dragging || turning || g.anim.length ||
                   (g.blendDur && g.time < g.blendStart + g.blendDur) || g.look.markers > 0.01);
    if (moving || g.needsDraw) {
      g.needsDraw = false;
      drawGlobe(g);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
