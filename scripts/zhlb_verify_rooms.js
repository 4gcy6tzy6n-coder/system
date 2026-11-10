// 验证：全部楼宇的房间清单 + 抽查几个房间的周课表
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
      return await r.json();
    };
    const buildings = await call('GetWebBuildingV1List', { schoolUid: '002' });
    const rooms = [];
    for (const b of buildings.data) {
      const rs = await call('GetWebBuildingRoomV1List', { schoolUid: '002', buildingUid: b.buildingUid });
      rooms.push({ building: b, rooms: rs.data || [] });
      await new Promise(r => setTimeout(r, 200));
    }
    // 抽查周课表
    const samples = [];
    for (const x of rooms) {
      if (!x.rooms.length) continue;
      const r = x.rooms[0];
      const tt = await call('GetTimetableV1RoomWeekTimetable', { roomUid: r.roomUid, weekIndex: 10, schoolUid: '002' });
      samples.push({ room: r.roomName, building: x.building.buildingName, count: (tt.data || []).length, first: (tt.data || [])[0] || null });
      await new Promise(r2 => setTimeout(r2, 200));
    }
    return { rooms, samples };
  });

  fs.writeFileSync('data/rooms_full.json', JSON.stringify(out.rooms, null, 1));
  let total = 0;
  for (const x of out.rooms) {
    console.log(`${x.building.buildingName} (${x.building.buildingUid.slice(0, 8)}): ${x.rooms.length} rooms`);
    total += x.rooms.length;
  }
  console.log('TOTAL rooms:', total);
  console.log('\n--- week-10 samples ---');
  for (const s of out.samples) console.log(s.building, s.room, '→', s.count, 'lessons', s.first ? '| e.g. ' + s.first.courseName + ' ' + JSON.stringify(s.first.lessonDate) : '');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
