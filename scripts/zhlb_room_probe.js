// 用真实 roomUid 试按房间查询：banpai 排课接口 + kindlink 变体；并解析 lessonRules 周次规则
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const CDP = 'http://127.0.0.1:9333';

function httpPut(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  let browser;
  for (let i = 0; i < 6; i++) {
    try { browser = await chromium.connectOverCDP(CDP); break; }
    catch (e) { await httpPut(`${CDP}/json/new?about:blank`).catch(() => {}); await new Promise(r => setTimeout(r, 1000)); }
  }
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  // lessonRules 结构
  const wk = JSON.parse(fs.readFileSync('data/my_timetable_week.json', 'utf-8'));
  console.log('--- lessonRules sample ---');
  console.log(JSON.stringify(wk.data.lessonRules.slice(0, 2), null, 1).slice(0, 800));
  console.log('--- columnHeaders ---');
  console.log(JSON.stringify(wk.data.metaInfo.columnHeaders).slice(0, 300));

  const roomUid = '5262456012864e1aa744f380644c8ea3';
  const out = await page.evaluate(async ({ roomUid }) => {
    const csrf = () => (document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/) || [])[1] || '';
    const bp = async (name, body) => {
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-csrf-token': csrf(), 'x-school-id': '002' },
        body: JSON.stringify(body || {}),
      });
      return (await r.text()).slice(0, 1200);
    };
    const g = async (u) => { const r = await fetch(u); return (await r.text()).slice(0, 1200); };
    const res = {};
    // banpai 按房间课表（参数猜测）
    res.curTT_room = await bp('PostMofangyunLocal18898MfTimetableApiGetCurrentTimetableByRoom', { roomUid });
    res.curTT_room2 = await bp('PostMofangyunLocal18898MfTimetableApiGetCurrentTimetableByRoom', { roomUid, date: '2026-11-11' });
    res.roomRel_room = await bp('GetV1TimetableRoomScheduleRelList', { roomUid });
    res.roomRel_date = await bp('GetV1TimetableRoomScheduleRelList', { date: '2026-11-11' });
    res.ttByDate_room = await bp('PostV1TimetableGetByDate', { date: '2026-11-11', roomUid });
    // kindlink 按房间变体
    res.kl_room = await g('/kindlink/frontend/api/course/resource/v1/timetable?queryDate=2026-11-11&queryScope=2&classRoomUid=' + roomUid);
    res.kl_room2 = await g('/kindlink/frontend/api/course/resource/v1/timetable?queryDate=2026-11-11&queryScope=2&roomUid=' + roomUid);
    return res;
  }, { roomUid });

  fs.writeFileSync('data/room_query_probe.json', JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v.replace(/\s+/g, ' ').slice(0, 500));
    console.log();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
