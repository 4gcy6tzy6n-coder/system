// 侦察 zhlb 已登录门户：收集菜单/链接/文本，寻找教室/空闲教室查询功能
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];

  // 1. 重新打开 zhjw 登录页（如果不在）
  let zhjw = ctx.pages().find(p => p.url().includes('zhjw'));
  if (!zhjw) {
    zhjw = await ctx.newPage();
    await zhjw.goto('http://zhjw.uibe.edu.cn/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  console.log('zhjw tab:', zhjw.url());

  // 2. zhlb 门户侦察
  const zhlb = ctx.pages().find(p => p.url().includes('zhlb'));
  if (!zhlb) { console.log('no zhlb tab'); process.exit(1); }
  console.log('zhlb URL:', zhlb.url());
  await zhlb.waitForTimeout(3000);

  const text = await zhlb.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 2500));
  console.log('=== zhlb TEXT ===');
  console.log(text);
  const links = await zhlb.$$eval('a[href]', as => [...new Map(as.map(a => [a.getAttribute('href') + '|' + a.textContent.trim().replace(/\s+/g, ' ').slice(0, 30), true])).keys()]);
  console.log('=== zhlb LINKS ===');
  for (const l of links) console.log(' ', l);
  await zhlb.screenshot({ path: 'raw/zhlb_portal.png', fullPage: false }).catch(e => console.log('shot:', e.message));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
