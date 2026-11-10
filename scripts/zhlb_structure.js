// 详细检查 zhlb 页面结构：frames、可点击元素
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  for (const p of ctx.pages()) {
    console.log('=== TAB:', p.url(), '|', await p.title().catch(() => ''));
    for (const f of p.frames()) {
      if (f === p.mainFrame()) continue;
      console.log('  FRAME:', f.url());
      const t = (await f.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 800) : '').catch(() => '(cross-origin)'));
      console.log('  frame text:', t);
    }
  }
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (page) {
    const html = await page.evaluate(() => document.body.innerHTML);
    require('fs').writeFileSync('raw/zhlb_dom.html', html);
    console.log('DOM saved, size', html.length);
    console.log('top text:', (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 800));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
