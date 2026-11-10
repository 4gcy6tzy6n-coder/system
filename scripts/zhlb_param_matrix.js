// 参数矩阵：探测 GetTimetableV1RoomTimetable / RoomWeekTimetable / RoomDaySeat 的必填参数
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
      return (await r.text()).slice(0, 900);
    };
    const roomUid = '5262456012864e1aa744f380644c8ea3';
    const res = {};
    const intNames = ['date','day','dayIndex','week','weekIndex','weekNum','termIndex','sectionIndex','section','num','index','queryDate','dayTs','ts'];
    for (const n of intNames) {
      const v = /date|day|ts/i.test(n) ? 20261111 : 10;
      const r = await call('GetTimetableV1RoomTimetable', { roomUid, [n]: v, schoolUid: '002' });
      res['RTT_' + n] = r.slice(0, 260);
    }
    // RoomDaySeat 带 schoolUid
    res.DaySeat = await call('GetLessonV1RoomDaySeat', { schoolUid: '002', roomUid, date: 20261111 });
    res.DaySeat2 = await call('GetLessonV1RoomDaySeat', { schoolUid: '002', roomUid, day: 20261111 });
    // Plans 带 schoolId
    res.Plans = await call('GetWebTimetableV1Plans', { schoolId: '002' });
    res.Plans2 = await call('GetWebTimetableV1Plans', { schoolId: 2 });
    return res;
  });

  fs.writeFileSync('data/param_matrix.json', JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k}: ${v.replace(/\s+/g, ' ')}`);
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
