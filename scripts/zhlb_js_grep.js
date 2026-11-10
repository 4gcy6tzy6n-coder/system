// 在 zhlb 所有 JS bundle 里搜索关键 API 的调用上下文（参数格式）
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(r => r.name).filter(u => /\.js(\?|$)/.test(u)));
  const keys = ['RoomCalendarV1Day', 'RoomActivityItemV1DayList', 'RoomOverviewModel', 'RoomSchedule', 'siteOrder', 'RoomOrderV1RoomListModel'];
  for (const src of resources) {
    let js = '';
    try { js = await page.evaluate(async (u) => (await fetch(u)).text(), src); } catch (e) { continue; }
    for (const key of keys) {
      let idx = 0, count = 0;
      while ((idx = js.indexOf(key, idx)) >= 0 && count < 3) {
        // 跳过纯枚举定义行
        const ctxStr = js.slice(Math.max(0, idx - 250), idx + 250).replace(/\s+/g, ' ');
        if (!ctxStr.includes(`="${key}"`)) {
          console.log(`--- ${key} @ ${src.split('/').pop()} ---`);
          console.log(ctxStr);
          console.log();
        }
        idx += key.length; count++;
      }
    }
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
