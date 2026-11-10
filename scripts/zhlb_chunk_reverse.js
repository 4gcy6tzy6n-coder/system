// 下载 banpai 应用全部 webpack 分包，逆向 Timetable API 调用参数
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

  // 先确保在 banpai 页面（同源相对路径）
  if (!page.url().includes('/banpai/')) {
    await page.goto('https://zhlb.uibe.edu.cn/banpai/platform/place', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
  }

  const result = await page.evaluate(async () => {
    // 从 webpack runtime 拿 chunk 清单：尝试常见全局；否则解析已加载脚本里的 chunk 映射
    const loaded = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.endsWith('.js'));
    const urls = new Set(loaded);
    // 抓 main bundle，找 chunk id → hash 映射（webpack jsonp）
    for (const u of loaded.filter(u => /main_|runtime|app\./.test(u))) {
      const js = await (await fetch(u)).text();
      // webpack5: self.webpackChunk... 或 chunk 映射形如 {123:"hash"}
      for (const m of js.matchAll(/(?:\w+)\.u\s*=\s*[^;]*?(\d+)\s*:\s*"([0-9a-f]{8,})"/g)) { /* webpack4 style */ }
      // 通用：抓所有 "xxxx.async.js" 或 "js/xxxx.js" 文件名模式
      for (const m of js.matchAll(/["']([\w./-]+\.js)["']/g)) {
        const cand = m[1];
        if (/chunk|async|\d+\./.test(cand)) urls.add(new URL(cand, location.href).href);
      }
    }
    return [...urls];
  });
  console.log('candidate js urls:', result.length);

  // 拉取每个 JS 并搜索调用处
  const hits = await page.evaluate(async (urls) => {
    const out = [];
    for (const u of urls) {
      let js = '';
      try { js = await (await fetch(u)).text(); } catch (e) { continue; }
      for (const key of ['GetCurrentTimetableByRoom', 'RoomScheduleRelList', 'TimetableGetByDate', 'ListCourseTimetable', 'ScheduleTableListGet', 'CountByDate']) {
        let idx = 0;
        while ((idx = js.indexOf(key, idx)) >= 0) {
          const s = js.slice(Math.max(0, idx - 900), idx + 600).replace(/\s+/g, ' ');
          if (!s.includes(`="${key}"`) && !/return \w+},\w+="/.test(s.slice(300, 600))) {
            out.push({ key, src: u.split('/').pop(), ctx: s });
          }
          idx += key.length;
        }
      }
    }
    return out;
  }, result);

  console.log('hits:', hits.length);
  const seen = new Set();
  for (const h of hits) {
    const sig = h.ctx.slice(200, 450);
    if (seen.has(sig)) continue;
    seen.add(sig);
    console.log(`\n===== ${h.key} @ ${h.src} =====`);
    console.log(h.ctx.slice(0, 1200));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
