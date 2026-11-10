// 重开 zhjw 标签页，抓登录页完整 DOM 找免登录入口
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];

  let zhjw = ctx.pages().find(p => p.url().includes('zhjw'));
  if (!zhjw) {
    zhjw = await ctx.newPage();
    await zhjw.goto('http://zhjw.uibe.edu.cn/', { waitUntil: 'domcontentloaded' }).catch(e => console.log('goto:', e.message));
    await zhjw.waitForTimeout(6000);
  }
  console.log('zhjw URL:', zhjw.url());
  console.log('zhjw title:', await zhjw.title().catch(() => ''));
  const html = await zhjw.content();
  fs.writeFileSync('raw/zhjw_logon.html', html);
  console.log('HTML saved,', html.length, 'bytes');
  const text = await zhjw.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'));
  console.log('=== TEXT ===');
  console.log(text.slice(0, 1500));
  const links = await zhjw.$$eval('a[href], [onclick]', els =>
    els.map(e => [e.getAttribute('href') || e.getAttribute('onclick') || '', e.textContent.trim().slice(0, 30)]).filter(x => x[0] || x[1]));
  console.log('=== LINKS/CLICKABLE ===');
  for (const [h, t] of links) console.log(' ', h.slice(0, 80), '|', t);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
