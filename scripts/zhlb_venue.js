// 点击 zhlb"场地管理"，捕获 SPA 的 API 调用
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const apiCalls = [];
  page.on('response', async res => {
    const u = res.url();
    if (/\.(png|jpg|css|js|woff|svg|gif)(\?|$)/i.test(u)) return;
    if (res.request().resourceType() === 'xhr' || res.request().resourceType() === 'fetch') {
      let bodyPreview = '';
      try { bodyPreview = (await res.text()).slice(0, 300); } catch (e) {}
      apiCalls.push({ method: res.request().method(), u, status: res.status(), bodyPreview });
    }
  });

  // 找到"场地管理"并点击
  const target = page.locator('text=场地管理').first();
  if (await target.count() === 0) {
    console.log('未找到"场地管理"入口，打印页面文本：');
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1000));
    process.exit(1);
  }
  await target.click();
  await page.waitForTimeout(5000);

  console.log('URL after click:', page.url());
  console.log('=== TEXT ===');
  console.log((await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'))).slice(0, 2000));
  console.log('=== API CALLS ===');
  for (const c of apiCalls) console.log(JSON.stringify(c));
  await page.screenshot({ path: 'raw/zhlb_venue.png', fullPage: false }).catch(e => console.log('shot:', e.message));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
