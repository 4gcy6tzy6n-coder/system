/* UIBE 教室空闲时间表
   多页面共用：数据加载 + 首页概览 / 单间查询 / 按时段找空
   数据优先级：① /api/*（server.js 直连教务平台，实时）② data/*（离线快照）③ 内置作息表 */
(function () {
  'use strict';

  var PERIODS = [
    { i: 1, start: '08:00', end: '08:45' }, { i: 2, start: '08:46', end: '09:30' },
    { i: 3, start: '09:50', end: '10:35' }, { i: 4, start: '10:36', end: '11:20' },
    { i: 5, start: '11:25', end: '12:10' }, { i: 6, start: '13:30', end: '14:15' },
    { i: 7, start: '14:16', end: '15:00' }, { i: 8, start: '15:20', end: '16:05' },
    { i: 9, start: '16:06', end: '16:50' }, { i: 10, start: '16:55', end: '17:40' },
    { i: 11, start: '18:30', end: '19:15' }, { i: 12, start: '19:16', end: '20:00' },
    { i: 13, start: '20:05', end: '20:50' }
  ];
  var TERM = { start: '2026-09-07', end: '2027-01-08', name: '2026-2027-1' };
  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  var PAGE = document.body.dataset.page || '';

  var state = {
    periods: PERIODS.slice(),
    term: TERM,
    rooms: [],
    building: '',
    roomUid: '',
    date: '',
    lastSource: '',
    reqKey: ''
  };

  var dayCache = new Map();
  // 只有本地 server.js 提供 /api/*；纯静态部署直接走快照，避免 404 噪音
  var LIVE = /^https?:$/.test(location.protocol) &&
    (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && !reduced);

  var $ = function (s) { return document.querySelector(s); };

  /* ---------------------------------------------------------- utils */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) {
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function dateLabel(s) {
    var d = parseDate(s);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + WEEKDAYS[d.getDay()];
  }
  function inTerm(s) { return s >= state.term.start && s <= state.term.end; }
  function defaultDate() {
    var t = fmtDate(new Date());
    return inTerm(t) ? t : state.term.start;
  }
  function weekNumber(s) {
    if (!inTerm(s)) return 0;
    var days = (parseDate(s) - parseDate(state.term.start)) / 86400000;
    return Math.min(18, Math.max(1, Math.floor(days / 7) + 1));
  }
  function periodRange(lo, hi) {
    return lo === hi ? '第 ' + lo + ' 节' : '第 ' + lo + '–' + hi + ' 节';
  }
  function periodTime(lo, hi) {
    var a = state.periods[lo - 1], b = state.periods[hi - 1];
    return a && b ? a.start + '–' + b.end : '';
  }
  function currentPeriod() {
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < state.periods.length; i++) {
      var p = state.periods[i];
      var sh = +p.start.slice(0, 2) * 60 + +p.start.slice(3);
      var eh = +p.end.slice(0, 2) * 60 + +p.end.slice(3);
      if (mins >= sh && mins <= eh) return p.i;
    }
    return null;
  }
  function nextPeriod() {
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < state.periods.length; i++) {
      if (mins <= +state.periods[i].end.slice(0, 2) * 60 + +state.periods[i].end.slice(3)) return state.periods[i].i;
    }
    return null;
  }
  function busySet(blocks) {
    var set = new Set();
    for (var i = 0; i < blocks.length; i++) {
      for (var p = blocks[i][0]; p <= blocks[i][1]; p++) set.add(p);
    }
    return set;
  }
  function blockToLesson(b) {
    return { startIdx: b[0], endIdx: b[1], course: b[2], teacher: b[3], classes: b[4], studentCount: b[5] };
  }
  function animate(nodes, from, to) {
    if (!hasGsap || !nodes || !nodes.length) return;
    window.gsap.fromTo(Array.prototype.slice.call(nodes), from,
      Object.assign({ clearProps: 'transform,opacity' }, to));
  }

  /* ---------------------------------------------------------- data */
  function jget(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  async function loadBase() {
    if (LIVE) {
      try {
        var s = await jget('/api/state');
        state.periods = (s.periods && s.periods.length ? s.periods : PERIODS);
        state.term = s.term || TERM;
        return;
      } catch (e) { LIVE = false; }
    }
    try {
      var m = await jget('data/meta.json');
      state.periods = (m.periods && m.periods.length ? m.periods : PERIODS);
      state.term = m.term || TERM;
      if (m.stats) {
        setCount('rooms', m.stats.rooms);
        setCount('weeks', (m.weeks && m.weeks.length) || 18);
        setCount('lessons', m.stats.lessonInstances);
      }
    } catch (e) { /* 用内置作息表 */ }
  }
  function setCount(key, value) {
    var node = document.querySelector('[data-count="' + key + '"]');
    if (!node || !value) return;
    node.dataset.value = String(value);
    node.textContent = Number(value).toLocaleString('en-US');
  }
  // 数据源里同一栋楼有异名（如「宁」实为宁远楼），统一成规范名
  var BUILDING_ALIAS = { '宁': '宁远楼' };
  function canonBuilding(b) { return BUILDING_ALIAS[b] || b; }
  function normalizeBuildings(list) {
    list.forEach(function (r) { r.building = canonBuilding(r.building); });
    return list;
  }

  async function loadRooms() {
    if (LIVE) {
      try {
        var r = await jget('/api/rooms');
        state.rooms = normalizeBuildings(r.rooms || []);
        return;
      } catch (e) { /* 落到快照 */ }
    }
    try { state.rooms = normalizeBuildings(await jget('data/rooms.json')); }
    catch (e) { state.rooms = []; }
  }
  async function snapshotDay(date) {
    if (dayCache.has(date)) return dayCache.get(date);
    var day = null;
    try { day = await jget('data/days/' + date + '.json'); }
    catch (e) { day = null; }
    dayCache.set(date, day);
    return day;
  }
  async function liveDay(roomUid, date) {
    if (!LIVE) return null;
    try {
      var d = await jget('/api/day?roomUid=' + encodeURIComponent(roomUid) + '&date=' + date);
      if (d && d.lessons) return { lessons: d.lessons, source: 'live' };
      if (d && d.source === 'expired') return { lessons: d.lessons, source: 'expired' };
    } catch (e) { /* 实时不可用 */ }
    return null;
  }
  async function findDataDate(start) {
    var d = parseDate(start);
    for (var i = 0; i < 12; i++) {
      var s = fmtDate(d);
      if (!inTerm(s)) break;
      if (await snapshotDay(s)) return s;
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  /* ---------------------------------------------------------- home */
  async function initHome() {
    if (!state.rooms.length) return;
    var today = fmtDate(new Date());
    var date = await findDataDate(defaultDate());
    var meta = $('#now-meta');
    var bars = $('#bars');
    if (!date || !bars) {
      if (meta) meta.textContent = '今天没有排课数据。';
      return;
    }
    var day = await snapshotDay(date);
    var nowI = currentPeriod();
    var counts = state.periods.map(function (p) {
      return state.rooms.filter(function (r) {
        return !busySet(day[r.roomUid] || []).has(p.i);
      }).length;
    });
    var max = Math.max.apply(null, counts) || 1;

    bars.replaceChildren();
    state.periods.forEach(function (p, idx) {
      var bar = el('div', 'bar' + (date === today && p.i === nowI ? ' is-now' : ''));
      bar.appendChild(el('span', 'bar__count', String(counts[idx])));
      var track = el('div', 'bar__track');
      var fill = el('div', 'bar__fill');
      fill.style.setProperty('--h', Math.max(4, Math.round(counts[idx] / max * 100)) + '%');
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(el('span', 'bar__p', String(p.i)));
      bar.title = '第 ' + p.i + ' 节 · ' + counts[idx] + ' 间空闲';
      bars.appendChild(bar);
    });

    if (meta) {
      if (date === today && nowI) {
        meta.innerHTML = '现在第 <b>' + nowI + '</b> 节 · <b>' + counts[nowI - 1] + '</b> 间教室空闲（共 ' + state.rooms.length + ' 间）';
      } else {
        meta.innerHTML = '<b>' + dateLabel(date) + '</b> · 共 ' + state.rooms.length + ' 间教室，按节次统计空闲数';
      }
    }
    var note = $('#now-note');
    if (note) note.textContent = '数据：11 月 10 日全学期快照 · 空闲 = 该节没有排课记录';

    animate(bars.querySelectorAll('.bar__fill'), { scaleY: 0, transformOrigin: 'bottom center' },
      { scaleY: 1, duration: 0.55, stagger: 0.035, ease: 'power3.out' });
    animate(bars.querySelectorAll('.bar__count'), { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, stagger: 0.03, ease: 'power2.out' });
  }

  function homeEntrance() {
    if (!hasGsap) return;
    var tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.home h1', { y: 22, opacity: 0, duration: 0.7 })
      .from('.home .lead, .home__stats', { y: 12, opacity: 0, duration: 0.45, stagger: 0.08 }, '-=0.45')
      .from('.entries .entry', { y: 16, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.25');
  }

  /* ---------------------------------------------------------- rooms */
  // 手工占位场地（127（手动）、默认场地）不做默认选中
  function defaultRoom(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].roomName.indexOf('手动') < 0 && list[i].roomName.indexOf('默认场地') < 0) return list[i];
    }
    return list[0];
  }

  function fillSelects() {
    var bSel = $('#sel-building'), rSel = $('#sel-room');
    var buildings = [];
    state.rooms.forEach(function (r) {
      if (buildings.indexOf(r.building) < 0) buildings.push(r.building);
    });

    bSel.replaceChildren();
    var all = el('option', '', '全部楼宇');
    all.value = '';
    bSel.appendChild(all);
    buildings.forEach(function (b) {
      var n = state.rooms.filter(function (r) { return r.building === b; }).length;
      var o = el('option', '', b + '（' + n + ' 间）');
      o.value = b;
      bSel.appendChild(o);
    });
    bSel.value = state.building;

    var rooms = state.rooms.filter(function (r) { return !state.building || r.building === state.building; });
    rSel.replaceChildren();
    var groups = new Map();
    rooms.forEach(function (r) {
      if (!groups.has(r.building)) groups.set(r.building, []);
      groups.get(r.building).push(r);
    });
    groups.forEach(function (rs, b) {
      var g = el('optgroup');
      g.label = b;
      rs.forEach(function (r) {
        var o = el('option', '', r.roomName + (r.seatCount ? '（' + r.seatCount + ' 座）' : ''));
        o.value = r.roomUid;
        g.appendChild(o);
      });
      rSel.appendChild(g);
    });
    if (!rooms.some(function (r) { return r.roomUid === state.roomUid; })) {
      var dr = defaultRoom(rooms);
      state.roomUid = dr ? dr.roomUid : '';
    }
    rSel.value = state.roomUid;
  }

  function renderAnswer(lessons) {
    var busyBox = $('#answer-busy'), freeBox = $('#answer-free');
    busyBox.replaceChildren();
    freeBox.replaceChildren();

    if (lessons === null) {
      busyBox.appendChild(el('p', 'calm', '这天还没有课表数据。'));
      freeBox.appendChild(el('p', 'calm', '换一个上课日试试。'));
      return;
    }

    var map = new Map();
    lessons.forEach(function (l) {
      for (var i = l.startIdx; i <= l.endIdx; i++) map.set(i, l);
    });

    var blocks = [], cur = null, lo = 0, hi = 0;
    for (var i = 1; i <= state.periods.length; i++) {
      var l = map.get(i);
      if (l) {
        if (cur === l) { hi = i; continue; }
        if (cur) blocks.push({ lo: lo, hi: hi, lesson: cur });
        cur = l; lo = hi = i;
      }
    }
    if (cur) blocks.push({ lo: lo, hi: hi, lesson: cur });

    if (!blocks.length) {
      var calm = el('p', 'calm');
      calm.appendChild(el('b', '', '今天全天空闲。'));
      calm.appendChild(document.createTextNode(' 13 节都没有排课记录。'));
      busyBox.appendChild(calm);
    } else {
      blocks.forEach(function (b) {
        var row = el('div', 'lesson');
        var time = el('div', 'lesson__time', periodRange(b.lo, b.hi));
        time.appendChild(el('span', '', periodTime(b.lo, b.hi)));
        var main = el('div', 'lesson__main');
        main.appendChild(el('b', '', b.lesson.course || '有课'));
        if (b.lesson.teacher) main.appendChild(el('span', '', b.lesson.teacher));
        row.appendChild(time);
        row.appendChild(main);
        busyBox.appendChild(row);
      });
    }

    var free = [];
    for (var p = 1; p <= state.periods.length; p++) if (!map.has(p)) free.push(p);
    if (!free.length) {
      freeBox.appendChild(el('p', 'calm', '今天没有空闲节次。'));
    } else {
      var ranges = [], a = free[0], b = free[0];
      for (var k = 1; k < free.length; k++) {
        if (free[k] === b + 1) { b = free[k]; continue; }
        ranges.push([a, b]); a = b = free[k];
      }
      ranges.push([a, b]);
      ranges.forEach(function (r) {
        var chip = el('div', 'free-chip');
        chip.appendChild(document.createTextNode(periodRange(r[0], r[1])));
        chip.appendChild(el('i', '', periodTime(r[0], r[1])));
        freeBox.appendChild(chip);
      });
    }

    animate(busyBox.children, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, stagger: 0.04, ease: 'power2.out' });
    animate(freeBox.children, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, stagger: 0.04, ease: 'power2.out' });
  }

  // 时间轴节点：按大节边界标注 8:00 / 9:50 / 11:20 / 12:10 / 13:30 / 15:20 / 16:50 / 17:40 / 18:30 / 20:00 / 20:50
  var AXIS_NODES = [
    { e: 0, t: '08:00' }, { e: 2, t: '09:50' }, { e: 4, t: '11:20' }, { e: 5, t: '12:10' },
    { e: 6, t: '13:30' }, { e: 8, t: '15:20' }, { e: 9, t: '16:50' }, { e: 10, t: '17:40' },
    { e: 11, t: '18:30' }, { e: 12, t: '20:00' }, { e: 13, t: '20:50' }
  ];
  var AXIS_NODES_TINY = [
    { e: 0, t: '08:00' }, { e: 2, t: '09:50' }, { e: 6, t: '13:30' }, { e: 8, t: '15:20' }, { e: 11, t: '18:30' }
  ];
  var AXIS_NODES_MOBILE = [
    { e: 0, t: '08:00' }, { e: 2, t: '09:50' }, { e: 6, t: '13:30' },
    { e: 8, t: '15:20' }, { e: 11, t: '18:30' }, { e: 13, t: '20:50' }
  ];
  function renderStripAxis() {
    var axis = document.querySelector('.strip__axis');
    if (!axis) return;
    var nodes = window.innerWidth <= 360 ? AXIS_NODES_TINY
      : window.innerWidth <= 720 ? AXIS_NODES_MOBILE : AXIS_NODES;
    axis.replaceChildren();
    nodes.forEach(function (n) {
      var s = el('span', '', n.t);
      s.style.left = (n.e / 13 * 100) + '%';
      if (n.e === 0) s.className = 'is-first';
      if (n.e === 13) s.className = 'is-last';
      axis.appendChild(s);
    });
  }

  function renderStrip(lessons) {
    var box = $('#strip');
    box.replaceChildren();
    if (lessons === null) return;
    var map = new Map();
    lessons.forEach(function (l) {
      for (var i = l.startIdx; i <= l.endIdx; i++) map.set(i, l);
    });
    var today = fmtDate(new Date());
    var nowI = currentPeriod();

    state.periods.forEach(function (p) {
      var lesson = map.get(p.i);
      var slot = el('div', 'strip__slot' + (lesson ? ' is-busy' : '') +
        (state.date === today && p.i === nowI ? ' is-now' : ''));
      slot.appendChild(el('span', 'n', String(p.i)));
      slot.title = '第 ' + p.i + ' 节 ' + p.start + '–' + p.end + ' · ' + (lesson ? lesson.course : '空闲');
      box.appendChild(slot);
    });

    renderStripAxis();
    animate(box.children, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, stagger: 0.022, ease: 'power2.out' });
  }

  function renderSourceNote() {
    var note = $('#source-note');
    if (!note) return;
    var map = {
      live: '实时数据：刚从教务系统读取。',
      cache: '离线快照：11 月 10 日采集，显示的是当时的排课。',
      expired: '教务登录已过期，先显示 11 月 10 日的快照；重新登录后即为实时。',
      none: '这天还没有数据，换一个上课日试试。'
    };
    note.textContent = map[state.lastSource] || '';
  }

  async function query() {
    if (!state.roomUid) return;
    var key = state.roomUid + '#' + state.date;
    state.reqKey = key;

    var snap = await snapshotDay(state.date);
    snap = snap ? (snap[state.roomUid] || []).map(blockToLesson) : null;
    if (state.reqKey !== key) return;
    state.lastSource = snap === null ? 'none' : 'cache';
    renderAnswer(snap);
    renderStrip(snap);
    renderSourceNote();

    var live = await liveDay(state.roomUid, state.date);
    if (state.reqKey !== key) return;
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

  async function initRooms() {
    if (!state.rooms.length) {
      $('#answer-busy').textContent = '课表数据还没就绪，稍后再来。';
      return;
    }
    var params = new URLSearchParams(location.search);
    var pDate = params.get('date');
    var pRoom = params.get('roomUid');
    if (pDate && inTerm(pDate)) state.date = pDate;
    if (pRoom) state.roomUid = pRoom;

    var dateEl = $('#sel-date');
    dateEl.value = state.date = state.date || defaultDate();
    dateEl.min = state.term.start;
    dateEl.max = state.term.end;

    if (!state.roomUid) state.roomUid = state.rooms[0].roomUid;
    fillSelects();

    $('#sel-building').addEventListener('change', function (e) {
      state.building = e.target.value;
      fillSelects();
      query();
    });
    $('#sel-room').addEventListener('change', function (e) {
      state.roomUid = e.target.value;
      query();
    });
    dateEl.addEventListener('change', function (e) {
      if (!inTerm(e.target.value)) { e.target.value = state.date; return; }
      state.date = e.target.value;
      query();
    });

    query();
  }

  /* ---------------------------------------------------------- free finder */
  function fillFinderPeriods() {
    var from = $('#finder-from'), to = $('#finder-to');
    var label;
    state.periods.forEach(function (p) {
      label = '第 ' + p.i + ' 节 · ' + p.start;
      var a = el('option', '', label); a.value = String(p.i);
      var b = el('option', '', label); b.value = String(p.i);
      from.appendChild(a);
      to.appendChild(b);
    });
    var cp = currentPeriod();
    from.value = cp ? String(cp) : '1';
    to.value = cp ? String(Math.min(13, cp + 1)) : '2';
  }

  async function renderFree(lo, hi, date) {
    var out = $('#finder-result');
    var day = await snapshotDay(date);
    if (!day) {
      out.replaceChildren(el('p', 'finder-empty', '这天没有排课数据（快照只覆盖有课的日子）。换一个上课日试试。'));
      return;
    }

    var free = [];
    state.rooms.forEach(function (r) {
      var busy = busySet(day[r.roomUid] || []);
      var ok = true;
      for (var p = lo; p <= hi; p++) if (busy.has(p)) { ok = false; break; }
      if (ok) free.push(r);
    });

    out.replaceChildren();
    var summary = el('div', 'finder-summary');
    summary.appendChild(el('strong', '', String(free.length)));
    summary.appendChild(el('span', '', '间教室在' + periodRange(lo, hi) + '整段空闲 · ' + dateLabel(date)));
    out.appendChild(summary);

    if (!free.length) {
      out.appendChild(el('p', 'finder-empty', '这个时段没有整段空闲的教室，换个节次试试。'));
      return;
    }

    var groups = new Map();
    free.forEach(function (r) {
      if (!groups.has(r.building)) groups.set(r.building, []);
      groups.get(r.building).push(r);
    });
    groups.forEach(function (rs, building) {
      var group = el('div', 'finder-group');
      var h = el('h3', '', building);
      h.appendChild(el('em', '', rs.length + ' 间'));
      group.appendChild(h);
      var chips = el('div', 'chips');
      rs.forEach(function (r) {
        var chip = el('a', 'chip');
        chip.href = 'rooms.html?roomUid=' + encodeURIComponent(r.roomUid) + '&date=' + encodeURIComponent(date);
        chip.appendChild(document.createTextNode(r.roomName));
        if (r.seatCount) chip.appendChild(el('i', '', r.seatCount + ' 座'));
        chips.appendChild(chip);
      });
      group.appendChild(chips);
      out.appendChild(group);
    });

    out.appendChild(el('p', 'finder-note', '按 11 月 10 日采集的全学期快照计算；临时借用与调课不计入。'));
    animate(out.querySelectorAll('.chip'), { y: 6, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.2, stagger: 0.004, ease: 'power2.out' });
  }

  async function onFinderSubmit(e) {
    if (e) e.preventDefault();
    var date = $('#finder-date').value;
    var lo = Number($('#finder-from').value);
    var hi = Number($('#finder-to').value);
    var out = $('#finder-result');
    if (!date || !inTerm(date)) {
      out.replaceChildren(el('p', 'finder-empty', '日期不在本学期的范围内。'));
      return;
    }
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    await renderFree(lo, hi, date);
  }

  async function initFree() {
    var dateEl = $('#finder-date');
    dateEl.value = defaultDate();
    dateEl.min = state.term.start;
    dateEl.max = state.term.end;
    fillFinderPeriods();
    $('#finder-form').addEventListener('submit', onFinderSubmit);
    dateEl.addEventListener('change', onFinderSubmit);
    $('#finder-from').addEventListener('change', onFinderSubmit);
    $('#finder-to').addEventListener('change', onFinderSubmit);
    if (!state.rooms.length) {
      $('#finder-result').replaceChildren(el('p', 'finder-empty', '课表数据还没就绪，稍后再来。'));
      return;
    }
    onFinderSubmit();
  }

  /* ---------------------------------------------------------- about */
  function initAbout() {
    var wk = weekNumber(fmtDate(new Date()));
    var node = $('#about-term');
    if (node && wk) node.textContent = '第 ' + wk + ' 教学周';
  }

  function countUp() {
    var nodes = document.querySelectorAll('[data-count]');
    Array.prototype.forEach.call(nodes, function (node) {
      var target = Number(node.dataset.value || node.dataset.count);
      if (!target) return;
      if (!hasGsap) { node.textContent = target.toLocaleString('en-US'); return; }
      var obj = { v: 0 };
      window.gsap.to(obj, {
        v: target, duration: 1.2, delay: 0.25, ease: 'power2.out',
        onUpdate: function () { node.textContent = Math.round(obj.v).toLocaleString('en-US'); }
      });
    });
  }

  /* ---------------------------------------------------------- boot */
  async function init() {
    await loadBase();
    await loadRooms();
    if (PAGE === 'home') { homeEntrance(); countUp(); }
    else if (PAGE === 'rooms') { initRooms(); }
    else if (PAGE === 'free') { initFree(); }
    else if (PAGE === 'about') { initAbout(); }
  }

  init();
})();
