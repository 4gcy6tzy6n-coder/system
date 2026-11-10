// 1) DaySeat 查有课日期 2) 房间目录 3) RoomTimetable 多 int 参数组合 4) RoomWeekTimetable 补参
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
      return (await r.text()).slice(0, 2000);
    };
    const roomUid = '5262456012864e1aa744f380644c8ea3'; // 知504，周四有自然语言处理
    const res = {};
    res.DaySeat_1112 = await call('GetLessonV1RoomDaySeat', { schoolUid: '002', roomUid, day: 20261112 });
    res.DaySeat_1110 = await call('GetLessonV1RoomDaySeat', { schoolUid: '002', roomUid, day: 20261110 });
    // 房间目录
    res.RoomList_web = await call('GetWebBuildingRoomV1List', { schoolUid: '002' });
    res.RoomList_web2 = await call('GetWebBuildingRoomV1List', { schoolUid: '002', buildingUid: 'f33d2dcc8a4644889c761dd8221c7831' });
    res.RoomTree = await call('GetWebBuildingRoomV1Tree', { schoolUid: '002' });
    // RoomTimetable 多 int 参数
    res.RTT_multi = await call('GetTimetableV1RoomTimetable', { roomUid, day: 20261112, weekIndex: 10, dayIndex: 4, sectionIndex: 2, termIndex: 1, schoolUid: '002' });
    res.RTT_multi2 = await call('GetTimetableV1RoomTimetable', { roomUid, day: 20261112, weekIndex: 10, dayIndex: 4, sectionIndex: 2, termIndex: 1, schoolUid: '002', planId: '1321097528820977664' });
    // RoomWeekTimetable 补参
    res.RWTT = await call('GetTimetableV1RoomWeekTimetable', { roomUid, weekIndex: 10, schoolUid: '002' });
    res.RWTT2 = await call('GetTimetableV1RoomWeekTimetable', { roomUid, weekIndex: 10, schoolUid: '002', planId: '1321097528820977664' });
    return res;
  });

  fs.writeFileSync('data/probe_round3.json', JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v.replace(/\s+/g, ' ').slice(0, 700));
    console.log();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
