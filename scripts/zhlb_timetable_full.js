// 拉取我的课表完整响应，分析结构（找 roomUid 等字段）；试探按房间/按日期查询的参数
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
  let page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const out = await page.evaluate(async () => {
    const g = async (u) => { const r = await fetch(u); return await r.text(); };
    const res = {};
    // 1) 我的完整课表（周视图）
    res.timetable_week = await g('/kindlink/frontend/api/course/resource/v1/timetable?queryDate=2026-11-10&queryScope=2');
    // 2) 按日期
    res.timetable_day = await g('/kindlink/frontend/api/course/resource/v1/timetable?queryDate=2026-11-11&queryScope=1');
    // 3) 教学计划
    res.plan = await g('/kindlink/frontend/api/course/resource/v1/timetable/plan');
    return res;
  });

  fs.writeFileSync('data/my_timetable_week.json', out.timetable_week);
  fs.writeFileSync('data/my_timetable_day.json', out.timetable_day);
  fs.writeFileSync('data/timetable_plan.json', out.plan);
  console.log('week len:', out.timetable_week.length, '| day len:', out.timetable_day.length);

  // 摘要结构
  const wk = JSON.parse(out.timetable_week);
  const d = wk.data;
  console.log('week keys:', Object.keys(d));
  console.log('metaInfo keys:', d.metaInfo ? Object.keys(d.metaInfo) : null);
  if (d.metaInfo && d.metaInfo.rowHeaders) console.log('periods:', d.metaInfo.rowHeaders.length);
  const arrs = Object.entries(d).filter(([k, v]) => Array.isArray(v));
  for (const [k, v] of arrs) console.log(`data.${k}: ${v.length} items`);
  // 打印第一个课程条目的完整字段
  for (const [k, v] of arrs) {
    if (v.length && typeof v[0] === 'object') {
      console.log(`--- sample of data.${k} ---`);
      console.log(JSON.stringify(v[0], null, 1).slice(0, 1500));
      break;
    }
  }
  // 打印节次表
  if (d.metaInfo && d.metaInfo.rowHeaders) {
    console.log('--- rowHeaders ---');
    for (const r of d.metaInfo.rowHeaders) console.log(JSON.stringify(r));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
