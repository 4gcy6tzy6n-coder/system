// 点击 zhlb"场地快速预约"，捕获 API 与页面变化
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) { console.log('no zhlb tab'); process.exit(1); }

  const apiCalls = [];
  const hook = p => {
    p.on('response', async res => {
      const u = res.url();
      if (/\.(png|jpg|css|js|woff|svg|gif)(\?|$)/i.test(u)) return;
      if (['xhr', 'fetch'].includes(res.request().resourceType())) {
        let body = '';
        try { body = (await res.text()).slice(0, 400); } catch (e) {}
        apiCalls.push({ u, method: res.request().method(), status: res.status(), body });
      }
    });
  };
  ctx.pages().forEach(hook);
  ctx.on('page', p => { hook(p); console.log('NEW TAB:', p.url()); });

  const target = page.locator('text=场地快速预约').first();
  await target.click();
  await page.waitForTimeout(6000);

  for (const p of ctx.pages()) {
    console.log('--- TAB:', p.url());
    if (/zhlb|uibe/.test(p.url())) {
      const t = (await p.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n') : '').catch(() => '')).slice(0, 1500);
      console.log(t);
    }
  }
  console.log('=== API CALLS ===');
  for (const c of apiCalls) console.log(JSON.stringify(c));
  await page.screenshot({ path: 'raw/zhlb_booking.png', fullPage: false }).catch(e => console.log('shot:', e.message));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
