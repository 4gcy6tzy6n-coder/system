// 打开"我的课表"并抓取真实课表 API（参数+响应）
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
  if (!browser) throw new Error('CDP 连接失败');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => /personalCenter/.test(p.url()));
  if (!page) {
    await httpPut(`${CDP}/json/new?${encodeURIComponent('https://zhlb.uibe.edu.cn/kindlink/frontend/personalCenter/personal')}`).catch(() => {});
    for (let i = 0; i < 20 && !page; i++) { await new Promise(r => setTimeout(r, 500)); page = ctx.pages().find(p => /personalCenter/.test(p.url())); }
  }
  if (!page) throw new Error('no personalCenter tab');
  await page.bringToFront().catch(() => {});

  const traffic = [];
  const hook = (p) => {
    p.on('response', async res => {
      const req = res.request(); const u = res.url();
      if (/\.(png|jpg|css|js|woff|woff2|svg|gif|ico)(\?|$)/i.test(u)) return;
      if (!['xhr', 'fetch'].includes(req.resourceType())) return;
      if (u.includes('dataCenterReport') || u.includes('myou.cvte.com') || u.includes('resource-proxy')) return;
      let body = ''; try { body = (await res.text()).slice(0, 3000); } catch (e) {}
      traffic.push({ url: u.replace('https://zhlb.uibe.edu.cn', ''), method: req.method(), post: (req.postData() || '').slice(0, 600), status: res.status(), body });
    });
  };
  ctx.pages().forEach(hook);

  await page.waitForTimeout(1500);
  console.log('URL:', page.url());
  console.log('=== page text ===');
  console.log((await page.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n') : '')).slice(0, 1200));

  // 找"课表"入口并点击
  traffic.length = 0;
  let clicked = false;
  for (const label of ['我的课表', '课表']) {
    const t = page.locator(`text=${label}`).first();
    if (await t.count()) {
      console.log(`>>> clicking ${label}`);
      await t.click().catch(e => console.log('click err:', e.message.split('\n')[0]));
      clicked = true;
      break;
    }
  }
  await page.waitForTimeout(7000);
  if (!clicked) console.log('未找到课表入口');

  console.log('URL now:', page.url());
  console.log('=== text after ===');
  console.log((await page.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n') : '')).slice(0, 1500));
  console.log(`=== traffic (${traffic.length}) ===`);
  for (const c of traffic) console.log(JSON.stringify(c));
  fs.writeFileSync('data/zhlb_mytimetable_traffic.json', JSON.stringify(traffic, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
