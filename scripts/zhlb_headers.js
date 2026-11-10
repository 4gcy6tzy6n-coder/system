// 抓 zhlb 真实 API 请求头；枚举真实加载的 JS 模块里的 actionName
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  // 抓请求头
  const captured = [];
  page.on('request', req => {
    if (req.url().includes('apis')) {
      captured.push({ url: req.url(), headers: req.headers(), postData: req.postData() });
    }
  });

  // 触发一次 UI 查询：切到"全部楼宇"再切回来，或点"列表模式"
  await page.locator('text=列表模式').first().click().catch(e => console.log('click list mode:', e.message));
  await page.waitForTimeout(4000);

  console.log('=== captured API request headers ===');
  for (const c of captured.slice(0, 2)) {
    console.log(c.url);
    console.log(JSON.stringify(c.headers, null, 1));
    console.log('POST:', (c.postData || '').slice(0, 400));
  }
  fs.writeFileSync('data/zhlb_api_headers.json', JSON.stringify(captured, null, 1));

  // 枚举真实加载的 JS 资源
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(r => r.name).filter(u => u.endsWith('.js')));
  console.log('js resources:', resources.length);
  const names = new Set();
  for (const src of resources) {
    try {
      const js = await page.evaluate(async (u) => (await fetch(u)).text(), src);
      for (const m of js.matchAll(/actionName=([A-Za-z0-9_]+)/g)) names.add(m[1]);
      for (const m of js.matchAll(/["']([A-Z][A-Za-z0-9]*(?:Model|List|Info|Save|Delete|Apply|Order)[A-Za-z0-9]*)["']/g)) names.add(m[1]);
    } catch (e) {}
  }
  console.log('=== names found in JS ===');
  [...names].sort().forEach(n => console.log(' ', n));
  fs.writeFileSync('data/zhlb_apinames2.json', JSON.stringify([...names].sort(), null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
