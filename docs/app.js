// UIBE 教室空闲 —— 极简查询台
// 数据来源优先级：① /api/*（server.js 直连教务平台，实时）② data/*（离线采集快照）③ 内置作息表
const PERIODS = [
  { i: 1, start: '08:00', end: '08:45' }, { i: 2, start: '08:46', end: '09:30' },
  { i: 3, start: '09:50', end: '10:35' }, { i: 4, start: '10:36', end: '11:20' },
  { i: 5, start: '11:25', end: '12:10' }, { i: 6, start: '13:30', end: '14:15' },
  { i: 7, start: '14:16', end: '15:00' }, { i: 8, start: '15:20', end: '16:05' },
  { i: 9, start: '16:06', end: '16:50' }, { i: 10, start: '16:55', end: '17:40' },
  { i: 11, start: '18:30', end: '19:15' }, { i: 12, start: '19:16', end: '20:00' },
  { i: 13, start: '20:05', end: '20:50' },
];
const TERM = { start: '2026-09-07', end: '2027-01-08', name: '2026-2027-1' };

const state = { periods: PERIODS, term: TERM, rooms: [], building: '', roomUid: '', date: '', source: '' };
const $ = (s) => document.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// 实时接口：服务器在就跑（任何端口/主机），不在就静默回退离线快照
let LIVE = true;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return r.json();
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inTerm(ds) { return ds >= state.term.start && ds <= state.term.end; }

function defaultDate() {
  const t = fmtDate(new Date());
  return inTerm(t) ? t : state.term.start;
}

// 把 [startIdx..endIdx] 合并成块
function toBlocks(lessons) {
  const map = new Map();
  for (const l of lessons) for (let i = l.startIdx; i <= l.endIdx; i++) map.set(i, l);
  return map;
}

function fmtRange(lo, hi) {
  const p1 = state.periods[lo - 1], p2 = state.periods[hi - 1];
  const time = lo === hi ? `${p1.start}–${p1.end}` : `${p1.start}–${p2.end}`;
  return `第 ${lo === hi ? lo : lo + '-' + hi} 节（${time}）`;
}

/* ---------- 数据加载 ---------- */
async function loadBase() {
  if (LIVE) {
    try {
      const s = await jget('/api/state');
      state.periods = s.periods || PERIODS;
      state.term = s.term || TERM;
      state.source = s.source || 'live';
      return;
    } catch (e) { LIVE = false; /* 没有服务器，走离线数据 */ }
  }
  try {
    const m = await jget('data/meta.json');
    state.periods = m.periods || PERIODS;
    state.term = m.term || TERM;
    state.source = 'cache';
  } catch (e) { state.source = 'none'; }
}

async function loadRooms() {
  if (LIVE) {
    try { state.rooms = (await jget('/api/rooms')).rooms; return; } catch (e) { /* 落到离线快照 */ }
  }
  try { state.rooms = await jget('data/rooms.json'); }
  catch (e) { state.rooms = []; }
}

async function loadSnapDay(roomUid, date) {
  try {
    const day = await jget(`data/days/${date}.json`);
    return (day[roomUid] || []).map(b => ({
      startIdx: b[0], endIdx: b[1], course: b[2], teacher: b[3], classes: b[4], studentCount: b[5],
    }));
  } catch (e) { return null; }
}

async function loadLiveDay(roomUid, date) {
  if (!LIVE) return null;
  try {
    const d = await jget(`/api/day?roomUid=${encodeURIComponent(roomUid)}&date=${date}`);
    if (d && d.lessons) return { lessons: d.lessons, source: 'live' };
    if (d && d.source === 'expired') return { lessons: d.lessons, source: 'expired' };
  } catch (e) { /* 实时不可用 */ }
  return null;
}

/* ---------- 渲染 ---------- */
function renderAnswer(lessons) {
  const busyEl = $('#answer-busy'), freeEl = $('#answer-free');
  if (lessons === null) {
    busyEl.innerHTML = '<span class="muted2">还没有这天的课表数据。</span>';
    freeEl.textContent = '—';
    return;
  }
  const map = toBlocks(lessons);

  // 上课：合并连续占用
  const busyBlocks = [];
  let s = null, p = null, cur = null;
  for (let i = 1; i <= state.periods.length; i++) {
    const l = map.get(i);
    if (l) {
      if (cur === l) { p = i; continue; }
      if (cur) busyBlocks.push({ lo: s, hi: p, l: cur });
      s = p = i; cur = l;
    }
  }
  if (cur) busyBlocks.push({ lo: s, hi: p, l: cur });

  if (!busyBlocks.length) {
    busyEl.innerHTML = '<b>今天全天空闲</b> <span class="muted2">没有排课记录</span>';
    freeEl.innerHTML = `<b>全部 ${state.periods.length} 节都空闲</b> <span class="muted2">${fmtRange(1, state.periods.length)}</span>`;
  } else {
    busyEl.innerHTML = busyBlocks.map(b =>
      `<b>${fmtRange(b.lo, b.hi)}</b> ${b.l.course}${b.l.teacher ? ' · ' + b.l.teacher : ''}`
    ).join('<br>');
    const free = [];
    for (let i = 1; i <= state.periods.length; i++) if (!map.has(i)) free.push(i);
    if (!free.length) {
      freeEl.innerHTML = '<b>今天没有空闲节次</b>';
    } else {
      // 合并连续空闲
      const rs = [];
      let a = free[0], b = free[0];
      for (const i of free.slice(1)) {
        if (i === b + 1) { b = i; continue; }
        rs.push([a, b]); a = b = i;
      }
      rs.push([a, b]);
      freeEl.innerHTML = rs.map(([lo, hi]) => `<b>${fmtRange(lo, hi)}</b>`).join('<br>');
    }
  }
  if (!reduced && window.gsap) {
    gsap.fromTo('.answer-line', { y: 8 }, { y: 0, duration: 0.3, stagger: 0.08, ease: 'power2.out', clearProps: 'all' });
  }
}

function renderStrip(lessons) {
  const box = $('#strip');
  box.innerHTML = '';
  if (lessons === null) return;
  const map = toBlocks(lessons);
  const today = fmtDate(new Date());
  const nowI = currentPeriod();
  for (const p of state.periods) {
    const l = map.get(p.i);
    const slot = document.createElement('div');
    slot.className = `strip__slot ${l ? 'is-busy' : 'is-free'} ${state.date === today && p.i === nowI ? 'is-now' : ''}`;
    slot.title = `第 ${p.i} 节 ${p.start}–${p.end} · ${l ? l.course : '空闲'}`;
    slot.innerHTML = `<span>${p.i}</span>`;
    box.appendChild(slot);
  }
  if (!reduced && window.gsap) {
    gsap.fromTo('.strip__slot', { y: 6 }, { y: 0, duration: 0.25, stagger: 0.025, ease: 'power2.out', clearProps: 'all' });
  }
}

function currentPeriod() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const p of state.periods) {
    const [sh, sm] = p.start.split(':').map(Number);
    const [eh, em] = p.end.split(':').map(Number);
    if (mins >= sh * 60 + sm && mins <= eh * 60 + em) return p.i;
  }
  return null;
}

/* ---------- hero 速览 ---------- */
async function renderPeek() {
  const date = defaultDate();
  const heroDate = $('#hero-date');
  heroDate.lastChild.textContent = date;
  $('#peek-title').textContent = `今日速览 · ${date}`;
  if (!state.rooms.length) return;

  // 第一所有课的教室做示例；统计此刻空闲
  const room = state.rooms[0];
  const lessons = await loadSnapDay(room.roomUid, date) || [];
  $('#peek-room').textContent = room.roomName;
  $('#peek-meta').textContent = lessons.length ? `今日有 ${lessons.length} 节课` : '今日全天空闲';

  const strip = $('#peek-strip');
  strip.innerHTML = '';
  const map = toBlocks(lessons);
  const nowI = currentPeriod();
  for (let i = 1; i <= state.periods.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'peek__slot' + (map.has(i) ? ' is-busy' : '') + (i === nowI ? ' is-now' : '');
    strip.appendChild(slot);
  }

  // 现在空闲几间（逐个查太慢：用快照数据统计；没有快照就不显示）
  let freeNow = '—';
  try {
    const day = await jget(`data/days/${date}.json`);
    const cnt = state.rooms.filter(r => {
      const busy = new Set();
      for (const b of day[r.roomUid] || []) for (let i = b[0]; i <= b[1]; i++) busy.add(i);
      return nowI ? !busy.has(nowI) : busy.size === 0;
    }).length;
    freeNow = String(cnt);
  } catch (e) { /* 无快照 */ }
  $('#peek-free').textContent = freeNow;
  $('#peek-slot').textContent = nowI ? `第 ${nowI} 节` : '课间';
}

/* ---------- 查询台 ---------- */
function fillSelects() {
  const bSel = $('#sel-building'), rSel = $('#sel-room');
  const buildings = [...new Set(state.rooms.map(r => r.building))];
  bSel.innerHTML = '<option value="">全部楼宇</option>' +
    buildings.map(b => {
      const n = state.rooms.filter(r => r.building === b).length;
      return `<option value="${b}">${b}（${n} 间）</option>`;
    }).join('');
  bSel.value = state.building;

  const rooms = state.rooms.filter(r => !state.building || r.building === state.building);
  // 按楼宇分组，一次看到全部教学楼
  const groups = new Map();
  for (const r of rooms) {
    if (!groups.has(r.building)) groups.set(r.building, []);
    groups.get(r.building).push(r);
  }
  let html = '';
  for (const [b, rs] of groups) {
    html += `<optgroup label="${b}">` +
      rs.map(r => `<option value="${r.roomUid}">${r.roomName}（${r.seatCount} 座）</option>`).join('') +
      '</optgroup>';
  }
  rSel.innerHTML = html;
  if (!rooms.some(r => r.roomUid === state.roomUid)) state.roomUid = rooms[0] ? rooms[0].roomUid : '';
  rSel.value = state.roomUid;
}

function renderSourceNote() {
  const note = $('#source-note');
  if (!note) return;
  const map = {
    live: '实时数据：刚自教务系统读取',
    cache: '离线快照：11-10 采集，显示的是当时的排课',
    expired: '教务登录已过期，先显示 11-10 采集的快照；重新登录后即为实时',
    none: '这天还没有数据',
  };
  note.textContent = map[state.lastSource] || '';
}

async function query() {
  if (!state.roomUid) return;
  const reqKey = state.roomUid + '#' + state.date;
  state.reqKey = reqKey;

  // ① 快照先秒出
  const snap = await loadSnapDay(state.roomUid, state.date);
  if (state.reqKey !== reqKey) return;
  state.lastSource = snap === null ? 'none' : 'cache';
  renderAnswer(snap);
  renderStrip(snap);
  renderSourceNote();

  // ② 实时成功则覆盖
  const live = await loadLiveDay(state.roomUid, state.date);
  if (state.reqKey !== reqKey) return;
  if (live && live.lessons) {
    state.lastSource = live.source;
    renderAnswer(live.lessons);
    renderStrip(live.lessons);
    renderSourceNote();
  } else if (live && live.source === 'expired') {
    state.lastSource = 'expired';
    renderSourceNote();
  }
}

/* ---------- 启动 ---------- */
async function init() {
  await loadBase();
  await loadRooms();

  const dateEl = $('#sel-date');
  dateEl.value = state.date = defaultDate();
  dateEl.min = state.term.start;
  dateEl.max = state.term.end;

  if (!state.rooms.length) {
    $('#answer-busy').innerHTML = '<span class="muted2">课表数据还没就绪，稍后再来。</span>';
    return;
  }
  state.roomUid = state.rooms[0].roomUid;
  fillSelects();

  $('#sel-building').addEventListener('change', (e) => {
    state.building = e.target.value;
    fillSelects();
    query();
  });
  $('#sel-room').addEventListener('change', (e) => {
    state.roomUid = e.target.value;
    query();
  });
  dateEl.addEventListener('change', (e) => {
    if (!inTerm(e.target.value)) { e.target.value = state.date; return; }
    state.date = e.target.value;
    query();
    renderPeek();
  });

  query();
  renderPeek();
}

init();
