// 用 POST + 真实 headers 调用关键 API；从 JS 找 RoomSchedule 参数格式
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  // 复用已捕获的头
  const hdrs = JSON.parse(fs.readFileSync('data/zhlb_real_headers.json', 'utf-8')).headers;

  const out = await page.evaluate(async ({ hdrs }) => {
    const call = async (name, body) => {
      const h = { ...hdrs };
      delete h['content-length']; delete h['x-trace-id'];
      const r = await fetch(`/banpai/platform/apis?actionName=${name}`, {
        method: 'POST', headers: h, body: JSON.stringify(body || {}),
      });
      return (await r.text()).slice(0, 900);
    };
    const res = {};
    res.TermList = await call('GetV1TermList');
    res.BuildingList = await call('GetV1SchoolBuildingList');
    res.BuildingRoomList = await call('GetV1SchoolBuildingRoomList');
    res.RoomSchedule = await call('GetWebRoomOrderV1RoomSchedule', {});
    res.RoomActivityDayList = await call('GetRoomActivityItemV1DayList', {});
    res.RoomOverview = await call('PostWebRoomOrderV1RoomOverviewModel', {});
    return res;
  }, { hdrs });

  for (const [k, v] of Object.entries(out)) {
    console.log(`=== ${k} ===`);
    console.log(v);
    console.log();
  }
  fs.writeFileSync('data/zhlb_api_samples2.json', JSON.stringify(out, null, 1));

  // 从 JS 里找 RoomSchedule 调用上下文
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(r => r.name).filter(u => u.endsWith('.js')));
  for (const src of resources) {
    const js = await page.evaluate(async (u) => (await fetch(u)).text(), src);
    const i = js.indexOf('GetWebRoomOrderV1RoomSchedule');
    if (i >= 0) {
      console.log('=== JS context for RoomSchedule in', src.split('/').pop(), '===');
      console.log(js.slice(Math.max(0, i - 600), i + 300).replace(/\s+/g, ' '));
    }
    const j = js.indexOf('GetRoomActivityItemV1DayList');
    if (j >= 0) {
      console.log('=== JS context for RoomActivityItemV1DayList ===');
      console.log(js.slice(Math.max(0, j - 600), j + 300).replace(/\s+/g, ' '));
    }
  }

  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
