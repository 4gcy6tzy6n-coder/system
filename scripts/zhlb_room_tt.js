// 试调房间课表/房间目录 API（多种参数形态）
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

  const out = await page.evaluate(async () => {
    const csrf = () => (document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/) || [])[1] || '';
    const call = async (name, body) => {
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-csrf-token': csrf(), 'x-school-id': '002' },
        body: JSON.stringify(body || {}),
      });
      return (await r.text()).slice(0, 1600);
    };
    const roomUid = '5262456012864e1aa744f380644c8ea3';
    const buildingUid = 'f33d2dcc8a4644889c761dd8221c7831'; // 知行楼
    const res = {};
    res.Buildings = await call('GetBuildingV1Buildings', { schoolUid: '002' });
    res.Rooms = await call('GetBuildingV1Rooms', { buildingUid, schoolUid: '002' });
    res.Rooms2 = await call('GetBuildingV1Rooms', {});
    res.RoomTT_a = await call('GetTimetableV1RoomTimetable', { roomUid, date: '2026-11-11' });
    res.RoomTT_b = await call('GetTimetableV1RoomTimetable', { roomUid });
    res.RoomWeekTT_a = await call('GetTimetableV1RoomWeekTimetable', { roomUid, date: '2026-11-11' });
    res.RoomWeekTT_b = await call('GetTimetableV1RoomWeekTimetable', { roomUid, weekIndex: 10 });
    res.RoomWeekCfg = await call('GetTimetableV1RoomWeekConfig', { roomUid });
    res.RoomDaySeat = await call('GetLessonV1RoomDaySeat', { roomUid, date: '2026-11-11' });
    res.WebPlans = await call('GetWebTimetableV1Plans', {});
    return res;
  });

  fs.writeFileSync('data/room_tt_probe.json', JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v.replace(/\s+/g, ' ').slice(0, 650));
    console.log();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
