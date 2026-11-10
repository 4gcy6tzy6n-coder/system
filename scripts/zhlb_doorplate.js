// 进入"门牌便捷管理"，抓取房间/课表相关 API
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
      const req = res.request(); const u = res.url();
      if (/\.(png|jpg|css|js|woff|woff2|svg|gif|ico)(\?|$)/i.test(u)) return;
      if (!['xhr', 'fetch'].includes(req.resourceType())) return;
      if (u.includes('dataCenterReport') || u.includes('myou.cvte.com') || u.includes('resource-proxy')) return;
      let body = ''; try { body = (await res.text()).slice(0, 2500); } catch (e) {}
      traffic.push({ url: u.replace('https://zhlb.uibe.edu.cn', ''), method: req.method(), post: (req.postData() || '').slice(0, 600), status: res.status(), body });
    });
  };
  ctx.pages().forEach(hook);
  ctx.on('page', p => { hook(p); console.log('NEW TAB:', p.url()); });

  await page.goto('https://zhlb.uibe.edu.cn/mf/edu-platform/main/portal', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);

  traffic.length = 0;
  const t = page.locator('text=门牌便捷管理').first();
  if (await t.count()) {
    await t.click().catch(e => console.log('click:', e.message.split('\n')[0]));
    await page.waitForTimeout(7000);
  } else { console.log('未找到门牌便捷管理卡片'); }

  console.log('=== tabs ===');
  for (const p of ctx.pages()) console.log(' ', p.url());
  console.log('=== current page text ===');
  const active = ctx.pages().filter(p => p.url().includes('zhlb')).pop() || page;
  console.log((await active.evaluate(() => document.body ? document.body.innerText.replace(/\n{2,}/g, '\n') : '')).slice(0, 1500));
  console.log(`=== traffic (${traffic.length}) ===`);
  for (const c of traffic) console.log(JSON.stringify(c));
  fs.writeFileSync('data/zhlb_doorplate_traffic.json', JSON.stringify(traffic, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
