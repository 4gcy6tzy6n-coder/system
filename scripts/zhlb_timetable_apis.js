// 深挖 zhlb Timetable API 家族：全部动作名 + 调用处参数格式
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(r => r.name).filter(u => /\.js(\?|$)/.test(u)));

  const allNames = new Set();
  const callSites = [];
  for (const src of resources) {
    let js = '';
    try { js = await page.evaluate(async (u) => (await fetch(u)).text(), src); } catch (e) { continue; }

    // 1) 所有 Timetable 动作名
    for (const m of js.matchAll(/["']([A-Za-z0-9_]*Timetable[A-Za-z0-9_]*)["']/g)) allNames.add(m[1]);

    // 2) RoomScheduleRel / CourseTimetable 的调用处上下文（排除枚举定义）
    for (const key of ['RoomScheduleRelList', 'ListCourseTimetable', 'ScheduleTableListGet', 'CountCourseTimetable', 'ScheduleTablePeriodGet']) {
      let idx = 0;
      while ((idx = js.indexOf(key, idx)) >= 0) {
        const s = js.slice(Math.max(0, idx - 700), idx + 400).replace(/\s+/g, ' ');
        if (!s.includes(`="${key.slice(0, 20)}`) && !/return \w+},\w+="/.test(s)) {
          callSites.push({ key, src: src.split('/').pop(), ctx: s });
        }
        idx += key.length;
      }
    }
  }
  console.log('=== Timetable action names ===');
  [...allNames].sort().forEach(n => console.log(' ', n));
  fs.writeFileSync('data/zhlb_timetable_apis.json', JSON.stringify([...allNames].sort(), null, 1));

  console.log('\n=== call sites (dedup) ===');
  const seen = new Set();
  for (const c of callSites) {
    const sig = c.ctx.slice(100, 300);
    if (seen.has(sig)) continue;
    seen.add(sig);
    console.log(`--- ${c.key} @ ${c.src} ---`);
    console.log(c.ctx);
    console.log();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
