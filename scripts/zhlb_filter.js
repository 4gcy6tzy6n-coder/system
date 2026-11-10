// 操作 zhlb 场地预约筛选器（楼宇/楼层/状态），捕获数据 API
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
    if (['xhr', 'fetch'].includes(res.request().resourceType())) {
      let body = '';
      try { body = (await res.text()).slice(0, 600); } catch (e) {}
      apiCalls.push({ u, method: res.request().method(), status: res.status(), req: res.request().postData()?.slice(0, 300) || '', body });
    }
  });

  // 打开"选择楼宇"下拉
  await page.locator('text=选择楼宇').first().click().catch(e => console.log('click1:', e.message));
  await page.waitForTimeout(1500);
  console.log('=== after opening building dropdown ===');
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));

  // 尝试选择"博学楼"
  const opt = page.locator('text=/博学楼/').first();
  if (await opt.count()) {
    await opt.click().catch(e => console.log('click opt:', e.message));
    await page.waitForTimeout(4000);
    console.log('=== after selecting 博学楼 ===');
    console.log((await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'))).slice(0, 2500));
  } else {
    console.log('no 博学楼 option found');
  }

  console.log('=== API CALLS ===');
  for (const c of apiCalls) console.log(JSON.stringify(c));
  await page.screenshot({ path: 'raw/zhlb_filter.png', fullPage: true }).catch(e => console.log('shot:', e.message));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
