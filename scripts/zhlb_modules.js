// 导航 zhlb 各模块（个人空间/门牌管理），完整抓取网络请求（URL+请求体+响应体）
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
  let page = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!page) {
    await httpPut(`${CDP}/json/new?${encodeURIComponent('https://zhlb.uibe.edu.cn/mf/edu-platform/main/portal')}`).catch(() => {});
    for (let i = 0; i < 20 && !page; i++) { await new Promise(r => setTimeout(r, 500)); page = ctx.pages().find(p => p.url().includes('zhlb')); }
  }
  if (!page) throw new Error('no zhlb tab');

  const traffic = [];
  const hook = (p) => {
    p.on('response', async res => {
      const req = res.request();
      const u = res.url();
      if (/\.(png|jpg|css|js|woff|woff2|svg|gif|ico)(\?|$)/i.test(u)) return;
      if (!['xhr', 'fetch'].includes(req.resourceType())) return;
      let body = ''; try { body = (await res.text()).slice(0, 1500); } catch (e) {}
      traffic.push({ url: u, method: req.method(), post: (req.postData() || '').slice(0, 500), status: res.status(), body });
    });
  };
  ctx.pages().forEach(hook);
  ctx.on('page', p => { hook(p); console.log('NEW TAB:', p.url()); });

  // 回到门户
  await page.goto('https://zhlb.uibe.edu.cn/mf/edu-platform/main/portal', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);

  // 点击各入口
  for (const label of ['个人空间', '门牌管理']) {
    traffic.length = 0;
    const t = page.locator(`text=${label}`).first();
    if (await t.count()) {
      await t.click().catch(e => console.log(`click ${label}:`, e.message.split('\n')[0]));
      await page.waitForTimeout(6000);
      console.log(`\n########## ${label} → ${page.url()}`);
      console.log((await page.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n') : '')).slice(0, 1200));
      console.log(`--- traffic (${traffic.length}) ---`);
      for (const c of traffic) {
        console.log(JSON.stringify({ url: c.url.replace('https://zhlb.uibe.edu.cn', ''), method: c.method, post: c.post.slice(0, 200), body: c.body.replace(/\s+/g, ' ').slice(0, 250) }));
      }
    } else {
      console.log(`\n########## ${label} 未找到`);
    }
    // 回门户
    await page.goto('https://zhlb.uibe.edu.cn/mf/edu-platform/main/portal', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  fs.writeFileSync('data/zhlb_module_traffic.json', JSON.stringify(traffic, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
