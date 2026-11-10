// 1) 用不同参数探测 RoomList API；2) 枚举 JS bundle 里的所有 actionName
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  // --- 探测 RoomList API ---
  const probe = await page.evaluate(async () => {
    const call = async (body) => {
      const r = await fetch('/banpai/platform/apis?actionName=PostWebRoomOrderV1RoomListModel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await r.text()).slice(0, 500);
    };
    const base = {
      page: 1, pageSize: 5,
      buildingUidList: ['307ffbd908d44c0e9b6d94d2d3f8edc3','70f664eae3d844aaa56fc475b111e5e0','aee24cda7f4845ae9f518be06de1da1a','9a1e3cd3bbc54dd68fc326a58e25aa8f','dad7172ae71441b68e45272cc413c777','0fc478f0119b4404bea379a6d0b4a101','f33d2dcc8a4644889c761dd8221c7831'],
      floorNumList: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
      searchKeyword: '', seatCountMin: null, seatCountMax: null, schoolUid: '002',
    };
    const now = Date.now();
    const results = {};
    results.status_all = await call({ ...base, roomStatus: null, startTime: now, endTime: now + 1800000 });
    results.status_1 = await call({ ...base, roomStatus: 1, startTime: now, endTime: now + 1800000 });
    results.status_2 = await call({ ...base, roomStatus: 2, startTime: now, endTime: now + 1800000 });
    results.next_week = await call({ ...base, roomStatus: null, startTime: now + 7 * 86400000, endTime: now + 7 * 86400000 + 1800000 });
    results.wide_range = await call({ ...base, roomStatus: null, startTime: now - 86400000, endTime: now + 30 * 86400000 });
    return results;
  });
  for (const [k, v] of Object.entries(probe)) console.log('PROBE', k, '=>', v);

  // --- 枚举 JS 里的 actionName ---
  const scripts = await page.$$eval('script[src]', ss => ss.map(s => s.src));
  console.log('scripts:', scripts.length);
  const names = new Set();
  for (const src of scripts) {
    try {
      const js = await page.evaluate(async (u) => (await fetch(u)).text(), src);
      for (const m of js.matchAll(/actionName=([A-Za-z0-9_]+)/g)) names.add(m[1]);
      for (const m of js.matchAll(/actionName["'\s:=]+["']([A-Za-z0-9_]+)/g)) names.add(m[1]);
    } catch (e) {}
  }
  console.log('=== actionName enum ===');
  [...names].sort().forEach(n => console.log(' ', n));
  fs.writeFileSync('data/zhlb_actionnames.json', JSON.stringify([...names].sort(), null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
